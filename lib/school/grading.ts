/*
 * WazaBolt Schools — results from marks. Pure and deterministic (no I/O), so
 * the same marks and settings always give the same averages, grades and
 * positions; tested in tests/unit/school-grading.test.ts.
 *
 * For each student and subject:
 *   subject average = Σ (weight × mark / max) / Σ weight × scale, over the
 *   assessments that count (missing marks: left out, or counted as 0 when the
 *   school says so; an absence is a missing mark), rounded half-up to the
 *   school's decimals. No mark at all → no average (the subject doesn't count).
 * For each student:
 *   points = subject average × coefficient (1 when coefficients are off),
 *   general average = Σ points / Σ coefficients of the subjects that count.
 * Grades come from the school's boundaries (highest minimum reached).
 * Positions: by average, highest first; equal averages share a position
 * (1, 2, 2, 4); no average → no position.
 */

export type GradeBoundary = { min: number; grade: string; remark?: string | null };

export type GradingSettings = {
  scaleMax: number;
  passMark: number;
  useCoefficients: boolean;
  rankStudents: boolean;
  missingMarks: "exclude" | "zero";
  gradeBoundaries: GradeBoundary[];
  decimals: number;
};

export type AssessmentInput = { id: string; name: string; weight: number; maxMark: number };
export type SubjectInput = { id: string; name: string; coefficient: number; teacher?: string | null };
export type StudentInput = { id: string; number: string; name: string };
export type MarkInput = { assessmentId: string; subjectId: string; studentId: string; mark: number | null; absent?: boolean };

export type SubjectResult = {
  subjectId: string;
  /** Per assessment: the mark, "abs" for an absence, or null. */
  marks: Record<string, number | "abs" | null>;
  average: number | null;
  coefficient: number;
  points: number | null;
  grade: string | null;
  remark: string | null;
  rank: number | null;
};

export type StudentResult = {
  studentId: string;
  subjects: SubjectResult[];
  totalPoints: number;
  totalCoefficients: number;
  average: number | null;
  grade: string | null;
  remark: string | null;
  rank: number | null;
  passed: boolean | null;
};

export type SubjectStats = { subjectId: string; classAverage: number | null; highest: number | null; lowest: number | null };

export type ClassResults = {
  students: StudentResult[];
  subjects: SubjectStats[];
  classAverage: number | null;
  highest: number | null;
  lowest: number | null;
  /** Students with an average at or above the pass mark, over students with an average. */
  passed: number;
  ranked: number;
};

/** Half away from zero at `decimals` (avoids 14.005 → 14.00 float errors). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return (Math.sign(value) * Math.round(Number((Math.abs(value) * f).toPrecision(15)))) / f;
}

export function gradeFor(value: number | null, boundaries: GradeBoundary[]): { grade: string | null; remark: string | null } {
  if (value === null) return { grade: null, remark: null };
  const sorted = [...boundaries].sort((a, b) => b.min - a.min);
  const hit = sorted.find((b) => value >= b.min);
  return hit ? { grade: hit.grade, remark: hit.remark ?? null } : { grade: null, remark: null };
}

/** Competition ranking (1, 2, 2, 4) of the values that exist; null values get no position. */
export function rankValues(values: (number | null)[]): (number | null)[] {
  return values.map((v) => (v === null ? null : 1 + values.filter((o) => o !== null && o > v).length));
}

export function subjectAverage(
  marks: Map<string, MarkInput>,
  assessments: AssessmentInput[],
  s: Pick<GradingSettings, "scaleMax" | "missingMarks" | "decimals">,
): number | null {
  let weighted = 0;
  let weights = 0;
  let any = false;
  for (const a of assessments) {
    const m = marks.get(a.id);
    const has = m && !m.absent && m.mark !== null && m.mark !== undefined;
    if (has) {
      any = true;
      weighted += (a.weight * Math.min(m.mark as number, a.maxMark)) / a.maxMark;
      weights += a.weight;
    } else if (s.missingMarks === "zero") {
      // A missing mark or an absence counts as 0 when the school says so.
      weights += a.weight;
    }
  }
  if (!any || weights === 0) return null;
  return roundTo((weighted / weights) * s.scaleMax, s.decimals);
}

export function computeClassResults(input: {
  settings: GradingSettings;
  assessments: AssessmentInput[];
  subjects: SubjectInput[];
  students: StudentInput[];
  marks: MarkInput[];
}): ClassResults {
  const { settings: s, assessments, subjects, students } = input;
  const byKey = new Map<string, Map<string, MarkInput>>();
  for (const m of input.marks) {
    const key = `${m.studentId}|${m.subjectId}`;
    if (!byKey.has(key)) byKey.set(key, new Map());
    byKey.get(key)!.set(m.assessmentId, m);
  }

  const results: StudentResult[] = students.map((st) => {
    let points = 0;
    let coefs = 0;
    const subs: SubjectResult[] = subjects.map((sub) => {
      const marks = byKey.get(`${st.id}|${sub.id}`) ?? new Map<string, MarkInput>();
      const average = subjectAverage(marks, assessments, s);
      const coefficient = s.useCoefficients ? sub.coefficient : 1;
      const p = average === null ? null : roundTo(average * coefficient, s.decimals);
      if (p !== null) {
        points += p;
        coefs += coefficient;
      }
      const g = gradeFor(average, s.gradeBoundaries);
      const shown: Record<string, number | "abs" | null> = {};
      for (const a of assessments) {
        const m = marks.get(a.id);
        shown[a.id] = !m ? null : m.absent ? "abs" : (m.mark ?? null);
      }
      return { subjectId: sub.id, marks: shown, average, coefficient, points: p, grade: g.grade, remark: g.remark, rank: null };
    });
    const totalPoints = roundTo(points, s.decimals);
    const totalCoefficients = roundTo(coefs, 2);
    const average = coefs > 0 ? roundTo(points / coefs, s.decimals) : null;
    const g = gradeFor(average, s.gradeBoundaries);
    return {
      studentId: st.id,
      subjects: subs,
      totalPoints,
      totalCoefficients,
      average,
      grade: g.grade,
      remark: g.remark,
      rank: null,
      passed: average === null ? null : average >= s.passMark,
    };
  });

  // Positions (overall and per subject), when the school ranks students.
  if (s.rankStudents) {
    const overall = rankValues(results.map((r) => r.average));
    results.forEach((r, i) => (r.rank = overall[i]));
    subjects.forEach((_, j) => {
      const ranks = rankValues(results.map((r) => r.subjects[j].average));
      results.forEach((r, i) => (r.subjects[j].rank = ranks[i]));
    });
  }

  const stats = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x !== null);
    if (!v.length) return { avg: null, hi: null, lo: null };
    return { avg: roundTo(v.reduce((a, b) => a + b, 0) / v.length, s.decimals), hi: Math.max(...v), lo: Math.min(...v) };
  };
  const subjectStats: SubjectStats[] = subjects.map((sub, j) => {
    const st = stats(results.map((r) => r.subjects[j].average));
    return { subjectId: sub.id, classAverage: st.avg, highest: st.hi, lowest: st.lo };
  });
  const all = stats(results.map((r) => r.average));
  const withAverage = results.filter((r) => r.average !== null);
  return {
    students: results,
    subjects: subjectStats,
    classAverage: all.avg,
    highest: all.hi,
    lowest: all.lo,
    passed: withAverage.filter((r) => r.passed).length,
    ranked: withAverage.length,
  };
}
