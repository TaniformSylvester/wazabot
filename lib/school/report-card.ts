import { computeClassResults, type AssessmentInput, type ClassResults, type GradingSettings, type MarkInput, type StudentResult, type SubjectInput } from "./grading";

/*
 * Report cards: everything printed for one class and term, in one object.
 * Built from the marks by the grading module; saved as the frozen snapshot
 * when results are published, so a report card prints the same later even
 * if marks or settings change. Rendered by the documents PDF engine.
 */

export type ReportLanguage = "en" | "fr";
export type ReportTemplate = "classic" | "modern";

export type ReportStudent = {
  id: string;
  number: string;
  name: string;
  gender: "female" | "male" | null;
  dateOfBirth: string | null;
  result: StudentResult;
  /** class_subject id → the subject teacher's comment. */
  subjectComments: Record<string, string>;
  classTeacherComment: string | null;
  principalComment: string | null;
};

export type ReportCardsData = {
  version: 1;
  language: ReportLanguage;
  template: ReportTemplate;
  school: {
    name: string;
    motto: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    registration: string | null;
    principal: string | null;
  };
  year: string;
  term: string;
  className: string;
  classTeacher: string | null;
  settings: GradingSettings;
  assessments: AssessmentInput[];
  subjects: SubjectInput[];
  students: ReportStudent[];
  stats: Omit<ClassResults, "students"> & { size: number };
  /** Null while results aren't published (printed as provisional). */
  publishedAt: string | null;
};

export function buildReportCards(input: {
  language: ReportLanguage;
  template: ReportTemplate;
  school: ReportCardsData["school"];
  year: string;
  term: string;
  className: string;
  classTeacher: string | null;
  settings: GradingSettings;
  assessments: AssessmentInput[];
  subjects: SubjectInput[];
  students: { id: string; number: string; name: string; gender: "female" | "male" | null; dateOfBirth: string | null }[];
  marks: MarkInput[];
  subjectComments: { subjectId: string; studentId: string; comment: string }[];
  termComments: { studentId: string; classTeacher: string | null; principal: string | null }[];
}): ReportCardsData {
  const results = computeClassResults({ settings: input.settings, assessments: input.assessments, subjects: input.subjects, students: input.students, marks: input.marks });
  const stats = { subjects: results.subjects, classAverage: results.classAverage, highest: results.highest, lowest: results.lowest, passed: results.passed, ranked: results.ranked };
  return {
    version: 1,
    language: input.language,
    template: input.template,
    school: input.school,
    year: input.year,
    term: input.term,
    className: input.className,
    classTeacher: input.classTeacher,
    settings: input.settings,
    assessments: input.assessments,
    subjects: input.subjects,
    students: input.students.map((st, i) => {
      const tc = input.termComments.find((c) => c.studentId === st.id);
      return {
        ...st,
        result: results.students[i],
        subjectComments: Object.fromEntries(input.subjectComments.filter((c) => c.studentId === st.id).map((c) => [c.subjectId, c.comment])),
        classTeacherComment: tc?.classTeacher ?? null,
        principalComment: tc?.principal ?? null,
      };
    }),
    stats: { ...stats, size: input.students.length },
    publishedAt: null,
  };
}

/** A snapshot read back from the database (shape checked loosely; it was written by buildReportCards). */
export function isReportCardsData(v: unknown): v is ReportCardsData {
  const o = v as Partial<ReportCardsData> | null;
  return !!o && o.version === 1 && Array.isArray(o.students) && Array.isArray(o.subjects) && Array.isArray(o.assessments) && !!o.settings;
}

export const REPORT_LABELS: Record<ReportLanguage, {
  title: string;
  year: string;
  term: string;
  className: string;
  classTeacher: string;
  student: string;
  number: string;
  born: string;
  sex: string;
  gender: Record<"female" | "male", string>;
  classSize: string;
  subject: string;
  average: string;
  coefficient: string;
  points: string;
  grade: string;
  rank: string;
  teacher: string;
  comment: string;
  abs: string;
  totals: string;
  generalAverage: string;
  position: string;
  of: string;
  classAverage: string;
  highest: string;
  lowest: string;
  decision: string;
  passed: string;
  notPassed: string;
  classTeacherComment: string;
  principalComment: string;
  signatures: { classTeacher: string; principal: string; parent: string; stamp: string };
  provisional: string;
  registration: string;
  page: string;
}> = {
  en: {
    title: "Report card",
    year: "Academic year",
    term: "Term",
    className: "Class",
    classTeacher: "Class teacher",
    student: "Student",
    number: "Student ID",
    born: "Date of birth",
    sex: "Gender",
    gender: { female: "Female", male: "Male" },
    classSize: "Class size",
    subject: "Subject",
    average: "Avg",
    coefficient: "Coef",
    points: "Points",
    grade: "Grade",
    rank: "Rank",
    teacher: "Teacher",
    comment: "Comment",
    abs: "Abs",
    totals: "Totals",
    generalAverage: "General average",
    position: "Position",
    of: "of",
    classAverage: "Class average",
    highest: "Highest",
    lowest: "Lowest",
    decision: "Result",
    passed: "Passed",
    notPassed: "Below the pass mark",
    classTeacherComment: "Class teacher's comment",
    principalComment: "Principal's comment",
    signatures: { classTeacher: "Class teacher", principal: "Principal", parent: "Parent / guardian", stamp: "School stamp" },
    provisional: "Provisional",
    registration: "Reg. no.",
    page: "Page",
  },
  fr: {
    title: "Bulletin de notes",
    year: "Année scolaire",
    term: "Trimestre",
    className: "Classe",
    classTeacher: "Professeur principal",
    student: "Élève",
    number: "Matricule",
    born: "Né(e) le",
    sex: "Sexe",
    gender: { female: "Féminin", male: "Masculin" },
    classSize: "Effectif",
    subject: "Matière",
    average: "Moy",
    coefficient: "Coef",
    points: "Points",
    grade: "Cote",
    rank: "Rang",
    teacher: "Enseignant",
    comment: "Appréciation",
    abs: "Abs",
    totals: "Totaux",
    generalAverage: "Moyenne générale",
    position: "Rang",
    of: "sur",
    classAverage: "Moyenne de la classe",
    highest: "Plus forte",
    lowest: "Plus faible",
    decision: "Résultat",
    passed: "Admis(e)",
    notPassed: "En dessous de la moyenne",
    classTeacherComment: "Appréciation du professeur principal",
    principalComment: "Appréciation du chef d'établissement",
    signatures: { classTeacher: "Professeur principal", principal: "Chef d'établissement", parent: "Parent / tuteur", stamp: "Cachet de l'établissement" },
    provisional: "Provisoire",
    registration: "N° d'autorisation",
    page: "Page",
  },
};

/** Numbers on report cards: the school's decimals, French or English separators. */
export function formatScore(v: number | null | undefined, decimals: number, lang: ReportLanguage): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v).replace(/[  ]/g, " ");
}
