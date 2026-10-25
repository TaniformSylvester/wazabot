import { describe, expect, it } from "vitest";

import { cheapestPlanWith, plans } from "@/config/plans";
import { PLANS } from "@/config/economics";
import { gradingPreset } from "@/lib/school/presets";
import { buildReportCards } from "@/lib/school/report-card";
import { buildSchoolReport } from "@/lib/school/reports";

const settings = gradingPreset("francophone_20", "fr").settings;
const school = {
  name: "Collège",
  motto: null,
  address: null,
  phone: null,
  email: null,
  registration: null,
  principal: null,
};
const student = (id: string, name: string) => ({
  id,
  number: id.toUpperCase(),
  name,
  gender: null,
  dateOfBirth: null,
});

function classData(marks: Record<string, [number | null, number | null]>) {
  const students = Object.keys(marks).map((id) => student(id, `Élève ${id}`));
  return buildReportCards({
    language: "fr",
    template: "classic",
    school,
    year: "2026-2027",
    term: "Trimestre 1",
    className: "6e",
    classTeacher: null,
    settings,
    assessments: [{ id: "s1", name: "Séquence 1", weight: 100, maxMark: 20 }],
    subjects: [
      { id: "maths", name: "Mathématiques", coefficient: 4, teacher: "M. Ndi" },
      { id: "fr", name: "Français", coefficient: 3 },
    ],
    students,
    marks: Object.entries(marks).flatMap(([id, [m, f]]) => [
      { assessmentId: "s1", subjectId: "maths", studentId: id, mark: m },
      { assessmentId: "s1", subjectId: "fr", studentId: id, mark: f },
    ]),
    subjectComments: [],
    termComments: [],
  });
}

describe("advanced school report", () => {
  it("summarises each class, each subject and the whole school", () => {
    const a = classData({ a: [16, 12], b: [8, 6], c: [null, null] });
    const b = classData({ d: [10, 10] });
    const r = buildSchoolReport({
      classes: [
        { id: "A", name: "6e A", data: a, published: true },
        { id: "B", name: "6e B", data: b, published: false },
        { id: "C", name: "5e", data: null, published: false },
      ],
      fees: new Map([
        ["A", { billed: 75_000, paid: 50_000 }],
        ["B", { billed: 25_000, paid: 25_000 }],
      ]),
    });
    const [ra, rb, rc] = r.classes;
    // 6e A: averages (16×4+12×3)/7 = 14.29 and (8×4+6×3)/7 = 7.14; one with no marks.
    expect(ra).toMatchObject({
      students: 3,
      published: true,
      average: a.stats.classAverage,
      passed: 1,
      ranked: 2,
      passRate: 0.5,
      outstanding: 25_000,
      collectionRate: 50_000 / 75_000,
    });
    expect(rb).toMatchObject({
      students: 1,
      passed: 1,
      ranked: 1,
      passRate: 1,
      collectionRate: 1,
    });
    expect(rc).toMatchObject({
      students: 0,
      average: null,
      passRate: null,
      billed: 0,
      collectionRate: null,
    });
    // Subjects: maths in 6e A — 16 and 8 → one of two at or above 10.
    const maths = r.subjects.find((s) => s.classId === "A" && s.subject === "Mathématiques")!;
    expect(maths).toMatchObject({
      coefficient: 4,
      teacher: "M. Ndi",
      withAverage: 2,
      passed: 1,
      passRate: 0.5,
      highest: 16,
      lowest: 8,
    });
    expect(r.subjects.filter((s) => s.classId === "C")).toHaveLength(0);
    // Whole school: every student's average counts once.
    expect(r.totals).toMatchObject({
      students: 4,
      passed: 2,
      ranked: 3,
      billed: 100_000,
      paid: 75_000,
      outstanding: 25_000,
      collectionRate: 0.75,
    });
    expect(r.totals.average).toBeCloseTo((14.29 + 7.14 + 10) / 3, 1);
  });
});

describe("plan entitlements (config)", () => {
  it("matches the owner's decisions and keeps prices unchanged", () => {
    const by = Object.fromEntries(PLANS.map((p) => [p.id, p]));
    expect(by.free).toMatchObject({
      monthlyPrice: 0,
      maxDocuments: 20,
      maxStudents: 50,
      maxReportCardStudents: 50,
      maxTeachers: 30,
      hasBulkReportCards: false,
      hasSchoolReports: false,
    });
    expect(by.boutique).toMatchObject({
      monthlyPrice: 5_000,
      maxDocuments: null,
      maxStudents: 200,
      hasBulkReportCards: true,
      hasSchoolReports: false,
    });
    expect(by.starter).toMatchObject({
      monthlyPrice: 10_000,
      maxDocuments: null,
      maxStudents: 200,
      hasBulkReportCards: true,
      hasSchoolReports: false,
    });
    expect(by.business).toMatchObject({
      monthlyPrice: 25_000,
      maxStudents: 500,
      hasSchoolReports: true,
    });
    expect(by.pro).toMatchObject({
      monthlyPrice: 50_000,
      maxStudents: null,
      maxReportCardStudents: null,
      hasSchoolReports: true,
    });
    expect(PLANS.every((p) => p.maxTeachers === 30)).toBe(true);
    // Kitchen accounts: free seats on every plan, like teacher seats.
    expect(PLANS.every((p) => p.maxKitchen === 30)).toBe(true);
  });

  it("names the cheapest plan that includes a feature", () => {
    expect(cheapestPlanWith((p) => p.hasBulkReportCards)?.id).toBe("boutique");
    expect(cheapestPlanWith((p) => p.hasSchoolReports)?.id).toBe("business");
    expect(cheapestPlanWith(() => false)).toBeUndefined();
    expect(plans.find((p) => p.id === "free")?.maxDocuments).toBe(20);
  });
});
