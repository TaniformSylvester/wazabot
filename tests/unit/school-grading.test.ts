import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { reportCardFileName, renderReportCardsPdf, shortAssessment } from "@/lib/documents/pdf/render";
import { computeClassResults, gradeFor, rankValues, roundTo, subjectAverage, type GradingSettings, type MarkInput } from "@/lib/school/grading";
import { boundariesText, gradingPreset, parseBoundaries } from "@/lib/school/presets";
import { buildReportCards } from "@/lib/school/report-card";

const fr20 = gradingPreset("francophone_20", "fr").settings;
const seqs = [
  { id: "s1", name: "Séquence 1", weight: 50, maxMark: 20 },
  { id: "s2", name: "Séquence 2", weight: 50, maxMark: 20 },
];
const mk = (studentId: string, subjectId: string, assessmentId: string, mark: number | null, absent = false): MarkInput => ({ studentId, subjectId, assessmentId, mark, absent });
const map = (marks: MarkInput[]) => new Map(marks.map((m) => [m.assessmentId, m]));

describe("subject averages", () => {
  it("weighted average of the assessments, on the school's scale", () => {
    expect(subjectAverage(map([mk("a", "m", "s1", 15), mk("a", "m", "s2", 12)]), seqs, fr20)).toBe(13.5);
    // CA /30 (30 %) + Exam /70 (70 %) → out of 100.
    const ang = gradingPreset("anglophone_100", "en");
    const ca = ang.terms[0].assessments.map((a, i) => ({ id: `a${i}`, ...a }));
    expect(subjectAverage(map([mk("a", "m", "a0", 24), mk("a", "m", "a1", 49)]), ca, ang.settings)).toBe(73);
  });

  it("missing marks: left out by default, or counted as 0", () => {
    const only1 = map([mk("a", "m", "s1", 15)]);
    expect(subjectAverage(only1, seqs, fr20)).toBe(15);
    expect(subjectAverage(only1, seqs, { ...fr20, missingMarks: "zero" })).toBe(7.5);
    // An absence is a missing mark.
    const abs = map([mk("a", "m", "s1", 16), mk("a", "m", "s2", null, true)]);
    expect(subjectAverage(abs, seqs, fr20)).toBe(16);
    expect(subjectAverage(abs, seqs, { ...fr20, missingMarks: "zero" })).toBe(8);
    // No mark at all: no average.
    expect(subjectAverage(map([mk("a", "m", "s1", null, true)]), seqs, fr20)).toBeNull();
    expect(subjectAverage(new Map(), seqs, { ...fr20, missingMarks: "zero" })).toBeNull();
  });

  it("rounds half-up at the school's decimals (no float drift)", () => {
    expect(roundTo(14.005, 2)).toBe(14.01);
    expect(roundTo(12.345, 2)).toBe(12.35);
    expect(roundTo(9.95, 1)).toBe(10);
    const third = [
      { id: "x", name: "x", weight: 1, maxMark: 20 },
      { id: "y", name: "y", weight: 2, maxMark: 20 },
    ];
    expect(subjectAverage(map([mk("a", "m", "x", 13), mk("a", "m", "y", 14)]), third, fr20)).toBe(13.67);
  });
});

describe("grades and positions", () => {
  it("grade from the highest boundary reached", () => {
    expect(gradeFor(16, fr20.gradeBoundaries)).toEqual({ grade: "A", remark: "Très bien" });
    expect(gradeFor(15.99, fr20.gradeBoundaries).grade).toBe("B");
    expect(gradeFor(9.99, fr20.gradeBoundaries).grade).toBe("E");
    expect(gradeFor(null, fr20.gradeBoundaries).grade).toBeNull();
    expect(gradeFor(5, []).grade).toBeNull();
  });

  it("ties share a position (1, 2, 2, 4); no average, no position", () => {
    expect(rankValues([12, 15, 15, null, 9])).toEqual([3, 1, 1, null, 4]);
  });

  it("grade boundaries as text, both ways", () => {
    const b = parseBoundaries("10 D Passable\n16 A Très bien\n0 E");
    expect(b).toEqual([
      { min: 16, grade: "A", remark: "Très bien" },
      { min: 10, grade: "D", remark: "Passable" },
      { min: 0, grade: "E", remark: null },
    ]);
    expect(boundariesText(b!)).toBe("16 A Très bien\n10 D Passable\n0 E");
    expect(parseBoundaries("sixteen A")).toBeNull();
  });
});

describe("class results", () => {
  const subjects = [
    { id: "math", name: "Mathématiques", coefficient: 4 },
    { id: "fr", name: "Français", coefficient: 3 },
    { id: "hist", name: "Histoire", coefficient: 2 },
  ];
  const students = [
    { id: "amina", number: "ELV-000001", name: "Amina Bello" },
    { id: "brice", number: "ELV-000002", name: "Brice Kamga" },
    { id: "carl", number: "ELV-000003", name: "Carl Ndi" },
    { id: "dora", number: "ELV-000004", name: "Dora Fon" },
  ];
  const marks: MarkInput[] = [
    // Amina: math 15/12 → 13.5, fr 14/14 → 14, hist 10/11 → 10.5
    mk("amina", "math", "s1", 15), mk("amina", "math", "s2", 12), mk("amina", "fr", "s1", 14), mk("amina", "fr", "s2", 14), mk("amina", "hist", "s1", 10), mk("amina", "hist", "s2", 11),
    // Brice: math 8 (absent seq 2) → 8, fr 9/10 → 9.5, history none
    mk("brice", "math", "s1", 8), mk("brice", "math", "s2", null, true), mk("brice", "fr", "s1", 9), mk("brice", "fr", "s2", 10),
    // Carl: same as Amina → same average, same position
    mk("carl", "math", "s1", 15), mk("carl", "math", "s2", 12), mk("carl", "fr", "s1", 14), mk("carl", "fr", "s2", 14), mk("carl", "hist", "s1", 10), mk("carl", "hist", "s2", 11),
    // Dora: no marks.
  ];
  const settings: GradingSettings = fr20;

  it("coefficients, totals, general average, grade, positions with ties, pass/fail", () => {
    const r = computeClassResults({ settings, assessments: seqs, subjects, students, marks });
    const amina = r.students[0];
    expect(amina.subjects.map((s) => s.average)).toEqual([13.5, 14, 10.5]);
    expect(amina.subjects.map((s) => s.points)).toEqual([54, 42, 21]);
    expect([amina.totalPoints, amina.totalCoefficients, amina.average, amina.grade, amina.passed]).toEqual([117, 9, 13, "C", true]);
    // Brice: history has no mark → not counted (coefficients 4 + 3).
    const brice = r.students[1];
    expect([brice.totalPoints, brice.totalCoefficients, brice.average, brice.passed]).toEqual([60.5, 7, 8.64, false]);
    expect(brice.subjects[0].marks).toEqual({ s1: 8, s2: "abs" });
    // Positions: Amina and Carl tie for 1st, Brice 3rd, Dora none.
    expect(r.students.map((s) => s.rank)).toEqual([1, 3, 1, null]);
    expect(r.students[3].average).toBeNull();
    // Class: averages of students who have one.
    expect([r.classAverage, r.highest, r.lowest, r.passed, r.ranked]).toEqual([11.55, 13, 8.64, 2, 3]);
    expect(r.subjects[0]).toEqual({ subjectId: "math", classAverage: 11.67, highest: 13.5, lowest: 8 });
    expect(r.students[0].subjects[0].rank).toBe(1);
    expect(r.students[1].subjects[0].rank).toBe(3);
  });

  it("without coefficients every subject counts once; without ranking no positions", () => {
    const r = computeClassResults({ settings: { ...settings, useCoefficients: false, rankStudents: false }, assessments: seqs, subjects, students, marks });
    expect(r.students[0].average).toBe(12.67);
    expect(r.students[0].totalCoefficients).toBe(3);
    expect(r.students.every((s) => s.rank === null)).toBe(true);
  });

  it("the same marks always give the same results (deterministic)", () => {
    const a = computeClassResults({ settings, assessments: seqs, subjects, students, marks });
    const b = computeClassResults({ settings, assessments: seqs, subjects, students, marks: [...marks].reverse() });
    expect(b).toEqual(a);
  });

  it("report cards render: one page per student, in every template and language; provisional until published", async () => {
    mkdirSync("test-results/school", { recursive: true });
    for (const [template, language] of [["classic", "fr"], ["modern", "en"]] as const) {
      const d = buildReportCards({
        language,
        template,
        school: { name: "Collège Les Lauriers", motto: "Travail · Discipline · Succès", address: "Bonamoussadi, Douala", phone: "+237 699 00 00 01", email: null, registration: "N° 123/MINESEC", principal: "M. Etoundi" },
        year: "2026-2027",
        term: language === "fr" ? "Trimestre 1" : "Term 1",
        className: "6e A",
        classTeacher: "Mme Ngo",
        settings,
        assessments: seqs,
        subjects: subjects.map((s) => ({ ...s, teacher: "M. Abena" })),
        students: students.map((s) => ({ ...s, gender: "female" as const, dateOfBirth: "2014-03-02" })),
        marks,
        subjectComments: [{ subjectId: "math", studentId: "amina", comment: "Bon travail, continuez" }],
        termComments: [{ studentId: "amina", classTeacher: "Élève sérieuse", principal: "Félicitations" }],
      });
      expect(d.students[0].result.average).toBe(13);
      const pdf = await renderReportCardsPdf(d);
      expect((pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length).toBe(4);
      writeFileSync(`test-results/school/report-cards-${template}.pdf`, pdf);
      const one = await renderReportCardsPdf({ ...d, publishedAt: "2026-12-20T10:00:00Z" }, { studentIds: ["amina"] });
      expect((one.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length).toBe(1);
      writeFileSync(`test-results/school/report-card-${template}-published.pdf`, one);
    }
    expect(["Séquence 1", "Continuous assessment", "Examination", "Exam"].map(shortAssessment)).toEqual(["Séq. 1", "CA", "Exam.", "Exam"]);
    expect(reportCardFileName({ language: "fr", className: "6e A", term: "Trimestre 1" })).toBe("bulletin-6e-a-trimestre-1.pdf");
    expect(reportCardFileName({ language: "en", className: "6e A", term: "Term 1" }, { number: "ELV-000001" })).toBe("report-card-elv-000001-term-1.pdf");
  });
});

describe("presets", () => {
  it("each preset gives settings, 3 terms and their assessments in the school's language", () => {
    for (const p of ["francophone_20", "anglophone_100", "primary"] as const) {
      const def = gradingPreset(p, "fr");
      expect(def.terms).toHaveLength(3);
      expect(def.terms.every((t) => t.assessments.length >= 1)).toBe(true);
      expect(def.settings.passMark).toBeLessThanOrEqual(def.settings.scaleMax);
    }
    expect(gradingPreset("francophone_20", "fr").terms[2].assessments[1].name).toBe("Séquence 6");
    expect(gradingPreset("anglophone_100", "en").settings.gradeBoundaries[0]).toEqual({ min: 80, grade: "A", remark: "Excellent" });
    expect(gradingPreset("primary", "en").settings.rankStudents).toBe(false);
  });
});
