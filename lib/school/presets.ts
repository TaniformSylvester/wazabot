import type { GradeBoundary, GradingSettings } from "./grading";

/*
 * Starting points for a school's grading. Choosing a preset fills the
 * settings, terms and assessments; every value can then be changed (nothing
 * here is enforced: the school's own settings are what count).
 */

export const GRADING_PRESETS = ["francophone_20", "anglophone_100", "primary"] as const;
export type GradingPreset = (typeof GRADING_PRESETS)[number];

export type PresetDefinition = {
  settings: Omit<GradingSettings, "gradeBoundaries"> & { gradeBoundaries: GradeBoundary[] };
  /** Terms of a year, each with its assessments (name, weight, maximum mark). */
  terms: { name: string; assessments: { name: string; weight: number; maxMark: number }[] }[];
};

type Lang = "en" | "fr";

export function gradingPreset(preset: GradingPreset, lang: Lang): PresetDefinition {
  const fr = lang === "fr";
  const term = (n: number) => (fr ? `Trimestre ${n}` : `Term ${n}`);
  if (preset === "anglophone_100") {
    return {
      settings: {
        scaleMax: 100,
        passMark: 50,
        useCoefficients: false,
        rankStudents: true,
        missingMarks: "exclude",
        decimals: 1,
        gradeBoundaries: [
          { min: 80, grade: "A", remark: fr ? "Excellent" : "Excellent" },
          { min: 70, grade: "B", remark: fr ? "Très bien" : "Very good" },
          { min: 60, grade: "C", remark: fr ? "Bien" : "Good" },
          { min: 50, grade: "D", remark: fr ? "Passable" : "Pass" },
          { min: 40, grade: "E", remark: fr ? "Faible" : "Weak" },
          { min: 0, grade: "F", remark: fr ? "Échec" : "Fail" },
        ],
      },
      terms: [1, 2, 3].map((n) => ({
        name: term(n),
        assessments: [
          { name: fr ? "Contrôle continu" : "Continuous assessment", weight: 30, maxMark: 30 },
          { name: fr ? "Examen" : "Examination", weight: 70, maxMark: 70 },
        ],
      })),
    };
  }
  if (preset === "primary") {
    return {
      settings: {
        scaleMax: 20,
        passMark: 10,
        useCoefficients: false,
        rankStudents: false,
        missingMarks: "exclude",
        decimals: 2,
        gradeBoundaries: [
          { min: 16, grade: "A", remark: fr ? "Très bien" : "Very good" },
          { min: 14, grade: "B", remark: fr ? "Bien" : "Good" },
          { min: 12, grade: "C", remark: fr ? "Assez bien" : "Fairly good" },
          { min: 10, grade: "D", remark: fr ? "Passable" : "Average" },
          { min: 0, grade: "E", remark: fr ? "Insuffisant" : "Below average" },
        ],
      },
      terms: [1, 2, 3].map((n) => ({
        name: term(n),
        assessments: [
          { name: fr ? "Évaluation 1" : "Evaluation 1", weight: 50, maxMark: 20 },
          { name: fr ? "Évaluation 2" : "Evaluation 2", weight: 50, maxMark: 20 },
        ],
      })),
    };
  }
  return {
    settings: {
      scaleMax: 20,
      passMark: 10,
      useCoefficients: true,
      rankStudents: true,
      missingMarks: "exclude",
      decimals: 2,
      gradeBoundaries: [
        { min: 16, grade: "A", remark: fr ? "Très bien" : "Very good" },
        { min: 14, grade: "B", remark: fr ? "Bien" : "Good" },
        { min: 12, grade: "C", remark: fr ? "Assez bien" : "Fairly good" },
        { min: 10, grade: "D", remark: fr ? "Passable" : "Pass" },
        { min: 0, grade: "E", remark: fr ? "Insuffisant" : "Fail" },
      ],
    },
    // Two sequences per term (6 per year).
    terms: [1, 2, 3].map((n) => ({
      name: term(n),
      assessments: [
        { name: fr ? `Séquence ${2 * n - 1}` : `Sequence ${2 * n - 1}`, weight: 50, maxMark: 20 },
        { name: fr ? `Séquence ${2 * n}` : `Sequence ${2 * n}`, weight: 50, maxMark: 20 },
      ],
    })),
  };
}

/** Grade boundaries from text, one per line: "16 A Très bien" (minimum, grade, remark). */
export function parseBoundaries(text: string): GradeBoundary[] | null {
  const out: GradeBoundary[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+(?:[.,]\d+)?)\s+(\S{1,6})(?:\s+(.{1,40}))?$/);
    if (!m) return null;
    out.push({ min: Number(m[1].replace(",", ".")), grade: m[2], remark: m[3]?.trim() || null });
  }
  return out.length <= 20 ? out.sort((a, b) => b.min - a.min) : null;
}

export function boundariesText(b: GradeBoundary[]): string {
  return [...b]
    .sort((x, y) => y.min - x.min)
    .map((x) => [x.min, x.grade, x.remark].filter((v) => v !== null && v !== undefined && v !== "").join(" "))
    .join("\n");
}
