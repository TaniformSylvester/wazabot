import type { ReportCardsData } from "./report-card";

/*
 * Advanced school reports (Business and Pro plans): for one term, each
 * class's results and fee collection, and each subject's results per class.
 * Built from the same report card data the school publishes (the frozen
 * snapshot once published, the current marks before), so the numbers match
 * the report cards.
 */

export type ClassReportRow = {
  classId: string;
  className: string;
  students: number;
  published: boolean;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  /** Students at or above the pass mark, of those with an average. */
  passed: number;
  ranked: number;
  passRate: number | null;
  billed: number;
  paid: number;
  outstanding: number;
  collectionRate: number | null;
};

export type SubjectReportRow = {
  classId: string;
  className: string;
  subject: string;
  coefficient: number;
  teacher: string | null;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passed: number;
  withAverage: number;
  passRate: number | null;
};

export type SchoolReport = {
  classes: ClassReportRow[];
  subjects: SubjectReportRow[];
  totals: {
    students: number;
    average: number | null;
    passed: number;
    ranked: number;
    passRate: number | null;
    billed: number;
    paid: number;
    outstanding: number;
    collectionRate: number | null;
  };
};

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function buildSchoolReport(input: {
  classes: {
    id: string;
    name: string;
    data: ReportCardsData | null;
    published: boolean;
  }[];
  /** Fees of the year billed to each class's students (live invoices). */
  fees: Map<string, { billed: number; paid: number }>;
}): SchoolReport {
  const classes: ClassReportRow[] = [];
  const subjects: SubjectReportRow[] = [];
  const allAverages: number[] = [];
  for (const c of input.classes) {
    const d = c.data;
    const fee = input.fees.get(c.id) ?? { billed: 0, paid: 0 };
    const averages = (d?.students ?? []).map((s) => s.result.average).filter((v): v is number => v !== null);
    allAverages.push(...averages);
    classes.push({
      classId: c.id,
      className: c.name,
      students: d?.students.length ?? 0,
      published: c.published,
      average: d?.stats.classAverage ?? null,
      highest: d?.stats.highest ?? null,
      lowest: d?.stats.lowest ?? null,
      passed: d?.stats.passed ?? 0,
      ranked: d?.stats.ranked ?? 0,
      passRate: rate(d?.stats.passed ?? 0, d?.stats.ranked ?? 0),
      billed: fee.billed,
      paid: fee.paid,
      outstanding: Math.max(0, fee.billed - fee.paid),
      collectionRate: rate(fee.paid, fee.billed),
    });
    if (!d) continue;
    for (const subject of d.subjects) {
      const stats = d.stats.subjects.find((x) => x.subjectId === subject.id);
      const subjectAverages = d.students.map((s) => s.result.subjects.find((x) => x.subjectId === subject.id)?.average ?? null).filter((v): v is number => v !== null);
      const passed = subjectAverages.filter((v) => v >= d.settings.passMark).length;
      subjects.push({
        classId: c.id,
        className: c.name,
        subject: subject.name,
        coefficient: subject.coefficient,
        teacher: subject.teacher ?? null,
        average: stats?.classAverage ?? null,
        highest: stats?.highest ?? null,
        lowest: stats?.lowest ?? null,
        passed,
        withAverage: subjectAverages.length,
        passRate: rate(passed, subjectAverages.length),
      });
    }
  }
  const sum = (k: "students" | "passed" | "ranked" | "billed" | "paid" | "outstanding") => classes.reduce((a, r) => a + r[k], 0);
  const decimals = input.classes.find((c) => c.data)?.data?.settings.decimals ?? 2;
  const avg = mean(allAverages);
  return {
    classes,
    subjects,
    totals: {
      students: sum("students"),
      average: avg === null ? null : Math.round(avg * 10 ** decimals) / 10 ** decimals,
      passed: sum("passed"),
      ranked: sum("ranked"),
      passRate: rate(sum("passed"), sum("ranked")),
      billed: sum("billed"),
      paid: sum("paid"),
      outstanding: sum("outstanding"),
      collectionRate: rate(sum("paid"), sum("billed")),
    },
  };
}
