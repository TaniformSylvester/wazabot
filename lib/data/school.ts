import "server-only";

import type { CurrentBusiness } from "@/lib/auth/dal";
import type { GradeBoundary, GradingSettings } from "@/lib/school/grading";
import { buildReportCards, isReportCardsData, type ReportCardsData, type ReportLanguage } from "@/lib/school/report-card";
import { createClient } from "@/lib/supabase/server";

import { userNames } from "./queries";

/*
 * WazaBolt Schools — reads for the dashboard, with the user's session: Row
 * Level Security limits teachers to their own classes, students and marks,
 * and hides fees from them.
 */

export type SchoolSettings = {
  school_type: string;
  registration_number: string | null;
  motto: string | null;
  principal_name: string | null;
  grading_preset: string;
  scale_max: number;
  pass_mark: number;
  use_coefficients: boolean;
  rank_students: boolean;
  missing_marks: "exclude" | "zero";
  grade_boundaries: GradeBoundary[];
  decimals: number;
  report_template: "classic" | "modern";
  report_language: "en" | "fr" | null;
  student_prefix: string;
  saved: boolean;
};

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  school_type: "secondary",
  registration_number: null,
  motto: null,
  principal_name: null,
  grading_preset: "francophone_20",
  scale_max: 20,
  pass_mark: 10,
  use_coefficients: true,
  rank_students: true,
  missing_marks: "exclude",
  grade_boundaries: [],
  decimals: 2,
  report_template: "classic",
  report_language: null,
  student_prefix: "STU",
  saved: false,
};

function boundaries(v: unknown): GradeBoundary[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((b) => {
    const o = (b ?? {}) as Record<string, unknown>;
    return typeof o.grade === "string" && Number.isFinite(Number(o.min)) ? [{ min: Number(o.min), grade: o.grade, remark: typeof o.remark === "string" ? o.remark : null }] : [];
  });
}

export async function getSchoolSettings(businessId: string): Promise<SchoolSettings> {
  const db = await createClient();
  const { data } = await db.from("school_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (!data) return DEFAULT_SCHOOL_SETTINGS;
  return {
    ...DEFAULT_SCHOOL_SETTINGS,
    ...data,
    scale_max: Number(data.scale_max),
    pass_mark: Number(data.pass_mark),
    missing_marks: data.missing_marks === "zero" ? "zero" : "exclude",
    grade_boundaries: boundaries(data.grade_boundaries),
    report_template: data.report_template === "modern" ? "modern" : "classic",
    report_language: data.report_language === "en" || data.report_language === "fr" ? data.report_language : null,
    saved: true,
  };
}

export function gradingSettings(s: SchoolSettings): GradingSettings {
  return {
    scaleMax: s.scale_max,
    passMark: s.pass_mark,
    useCoefficients: s.use_coefficients,
    rankStudents: s.rank_students,
    missingMarks: s.missing_marks,
    gradeBoundaries: s.grade_boundaries,
    decimals: s.decimals,
  };
}

/** Report cards and fee invoices: the school's language, else the business's when French or English. */
export function schoolLanguage(s: SchoolSettings, business: Pick<CurrentBusiness, "defaultLanguage">): ReportLanguage {
  return s.report_language ?? (business.defaultLanguage === "fr" ? "fr" : "en");
}

// ---------------------------------------------------------------- years, terms, assessments
export async function listYears(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("academic_years").select("id, name, starts_on, ends_on, is_current").eq("business_id", businessId).order("name", { ascending: false });
  return data ?? [];
}

/** The current year (marked current, else the latest), or a chosen one. */
export async function pickYear(businessId: string, yearId?: string | null) {
  const years = await listYears(businessId);
  return { years, year: years.find((y) => y.id === yearId) ?? years.find((y) => y.is_current) ?? years[0] ?? null };
}

export async function listTerms(businessId: string, yearId: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_terms")
    .select("id, name, position, starts_on, ends_on, school_assessments(id, name, weight, max_mark, position)")
    .eq("business_id", businessId)
    .eq("year_id", yearId)
    .order("position");
  return (data ?? []).map((t) => ({
    ...t,
    assessments: [...t.school_assessments]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ id: a.id, name: a.name, weight: Number(a.weight), maxMark: Number(a.max_mark), position: a.position })),
  }));
}

// ---------------------------------------------------------------- classes and subjects
export async function listSubjects(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("school_subjects").select("id, name, code").eq("business_id", businessId).order("name");
  return data ?? [];
}

export async function listClasses(businessId: string, yearId: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_classes")
    .select("id, name, level, class_teacher_id, school_enrollments(count), class_subjects(id, teacher_id)")
    .eq("business_id", businessId)
    .eq("year_id", yearId)
    .order("name");
  const rows = data ?? [];
  const names = await userNames(rows.map((c) => c.class_teacher_id));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    classTeacherId: c.class_teacher_id,
    classTeacher: c.class_teacher_id ? (names.get(c.class_teacher_id) ?? null) : null,
    students: c.school_enrollments[0]?.count ?? 0,
    subjects: c.class_subjects.length,
    teacherIds: c.class_subjects.map((s) => s.teacher_id).filter(Boolean) as string[],
  }));
}

export async function getClass(businessId: string, classId: string) {
  const db = await createClient();
  const { data: c } = await db
    .from("school_classes")
    .select("id, name, level, year_id, class_teacher_id, academic_years(name)")
    .eq("business_id", businessId)
    .eq("id", classId)
    .maybeSingle();
  if (!c) return null;
  const [{ data: subjects }, { data: enrolled }] = await Promise.all([
    db.from("class_subjects").select("id, coefficient, teacher_id, position, school_subjects(id, name, code)").eq("business_id", businessId).eq("class_id", classId).order("position"),
    db
      .from("school_enrollments")
      .select("id, status, school_students(id, student_number, first_name, last_name, gender, date_of_birth, status, guardian_customer_id)")
      .eq("business_id", businessId)
      .eq("class_id", classId),
  ]);
  const names = await userNames([c.class_teacher_id, ...(subjects ?? []).map((s) => s.teacher_id)]);
  const students = (enrolled ?? [])
    .flatMap((e) => (e.school_students ? [{ enrollmentId: e.id, enrollment: e.status, ...e.school_students }] : []))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return {
    id: c.id,
    name: c.name,
    level: c.level,
    yearId: c.year_id,
    yearName: c.academic_years?.name ?? "",
    classTeacherId: c.class_teacher_id,
    classTeacher: c.class_teacher_id ? (names.get(c.class_teacher_id) ?? null) : null,
    subjects: (subjects ?? []).map((s) => ({
      id: s.id,
      subjectId: s.school_subjects?.id ?? "",
      name: s.school_subjects?.name ?? "",
      code: s.school_subjects?.code ?? null,
      coefficient: Number(s.coefficient),
      teacherId: s.teacher_id,
      teacher: s.teacher_id ? (names.get(s.teacher_id) ?? null) : null,
      position: s.position,
    })),
    students,
  };
}

/** People who can be given a class or subject: teachers, and owners/admins who teach. Read by members only. */
export async function listTeachers(businessId: string) {
  const db = await createClient();
  const { data } = await db.from("business_members").select("user_id, role").eq("business_id", businessId).in("role", ["owner", "admin", "teacher"]);
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.user_id));
  return rows.map((r) => ({ id: r.user_id, role: r.role, name: names.get(r.user_id) ?? r.user_id.slice(0, 8) })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- students
export const STUDENTS_PAGE_SIZE = 50;

export async function listStudents(businessId: string, f: { q?: string; classId?: string; status?: string; page?: number } = {}) {
  const db = await createClient();
  let q = db
    .from("school_students")
    .select("id, student_number, first_name, last_name, gender, status, guardian_name, school_enrollments(class_id, year_id, school_classes(name))", { count: "exact" })
    .eq("business_id", businessId);
  if (f.status && ["active", "withdrawn", "graduated"].includes(f.status)) q = q.eq("status", f.status);
  const term = f.q?.trim().replace(/[%_,()*\\]/g, " ").trim();
  if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_number.ilike.%${term}%,guardian_name.ilike.%${term}%`);
  if (f.classId) {
    const { data: ids } = await db.from("school_enrollments").select("student_id").eq("business_id", businessId).eq("class_id", f.classId);
    q = q.in("id", (ids ?? []).map((r) => r.student_id).concat(["00000000-0000-0000-0000-000000000000"]));
  }
  const page = Math.max(1, f.page ?? 1);
  const { data, count } = await q.order("last_name").order("first_name").range((page - 1) * STUDENTS_PAGE_SIZE, page * STUDENTS_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0, page };
}

export async function getStudent(businessId: string, id: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_students")
    .select("*, customers(id, name, whatsapp_phone, reference), school_enrollments(id, class_id, year_id, status, school_classes(name), academic_years(name))")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** A student's fee invoices (members only: RLS hides documents from teachers). */
export async function studentFees(businessId: string, studentId: string) {
  const db = await createClient();
  const { data } = await db
    .from("documents")
    .select("id, number, status, issue_date, due_date, total, amount_paid, currency, items, fee_item_id")
    .eq("business_id", businessId)
    .eq("student_id", studentId)
    .eq("doc_type", "invoice")
    .neq("status", "draft")
    .order("issue_date", { ascending: false });
  const rows = data ?? [];
  const live = rows.filter((r) => r.status !== "voided");
  const billed = live.reduce((s, r) => s + Number(r.total), 0);
  const paid = live.reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);
  return { invoices: rows, billed, paid, balance: Math.max(0, billed - paid) };
}

// ---------------------------------------------------------------- marks, results
export async function marksFor(businessId: string, classSubjectIds: string[]) {
  if (!classSubjectIds.length) return [];
  const db = await createClient();
  const { data } = await db
    .from("school_marks")
    .select("assessment_id, class_subject_id, student_id, mark, absent")
    .eq("business_id", businessId)
    .in("class_subject_id", classSubjectIds)
    .limit(20000);
  return data ?? [];
}

export async function getPublication(businessId: string, termId: string, classId: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_result_publications")
    .select("id, results, published_at, published_by")
    .eq("business_id", businessId)
    .eq("term_id", termId)
    .eq("class_id", classId)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (!data || !isReportCardsData(data.results)) return null;
  return { id: data.id, publishedAt: data.published_at, data: { ...data.results, publishedAt: data.published_at } as ReportCardsData };
}

export async function listPublications(businessId: string, classId: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_result_publications")
    .select("id, term_id, published_at, withdrawn_at, withdraw_reason")
    .eq("business_id", businessId)
    .eq("class_id", classId)
    .order("published_at", { ascending: false });
  return data ?? [];
}

/**
 * Results of a class for a term, computed now from the marks and comments
 * (what would be published). The school's identity comes from the business
 * profile and school settings.
 */
export async function computeReportCards(business: CurrentBusiness, classId: string, termId: string): Promise<ReportCardsData | null> {
  const db = await createClient();
  const [settings, klass, { data: term }] = await Promise.all([
    getSchoolSettings(business.id),
    getClass(business.id, classId),
    db.from("school_terms").select("id, name, year_id, school_assessments(id, name, weight, max_mark, position)").eq("business_id", business.id).eq("id", termId).maybeSingle(),
  ]);
  if (!klass || !term || term.year_id !== klass.yearId) return null;
  const assessments = [...term.school_assessments].sort((a, b) => a.position - b.position).map((a) => ({ id: a.id, name: a.name, weight: Number(a.weight), maxMark: Number(a.max_mark) }));
  const assessmentIds = new Set(assessments.map((a) => a.id));
  const students = klass.students.filter((s) => s.enrollment === "enrolled");
  const [marks, { data: subjectComments }, { data: termComments }] = await Promise.all([
    marksFor(business.id, klass.subjects.map((s) => s.id)),
    db.from("school_subject_comments").select("class_subject_id, student_id, comment").eq("business_id", business.id).eq("term_id", termId),
    db.from("school_term_comments").select("student_id, class_teacher_comment, principal_comment").eq("business_id", business.id).eq("term_id", termId),
  ]);
  return buildReportCards({
    language: schoolLanguage(settings, business),
    template: settings.report_template,
    school: {
      name: business.name,
      motto: settings.motto,
      address: [business.address, business.city].filter(Boolean).join(", ") || null,
      phone: business.phone,
      email: business.email,
      registration: settings.registration_number,
      principal: settings.principal_name,
    },
    year: klass.yearName,
    term: term.name,
    className: klass.name,
    classTeacher: klass.classTeacher,
    settings: gradingSettings(settings),
    assessments,
    subjects: klass.subjects.map((s) => ({ id: s.id, name: s.name, coefficient: s.coefficient, teacher: s.teacher })),
    students: students.map((s) => ({
      id: s.id,
      number: s.student_number,
      name: `${s.last_name.toUpperCase()} ${s.first_name}`,
      gender: s.gender === "female" || s.gender === "male" ? s.gender : null,
      dateOfBirth: s.date_of_birth,
    })),
    marks: marks
      .filter((m) => assessmentIds.has(m.assessment_id))
      .map((m) => ({ assessmentId: m.assessment_id, subjectId: m.class_subject_id, studentId: m.student_id, mark: m.mark === null ? null : Number(m.mark), absent: m.absent })),
    subjectComments: (subjectComments ?? []).map((c) => ({ subjectId: c.class_subject_id, studentId: c.student_id, comment: c.comment })),
    termComments: (termComments ?? []).map((c) => ({ studentId: c.student_id, classTeacher: c.class_teacher_comment, principal: c.principal_comment })),
  });
}

// ---------------------------------------------------------------- fees
export async function listFeeItems(businessId: string, yearId: string) {
  const db = await createClient();
  const { data } = await db
    .from("school_fee_items")
    .select("id, name, amount, due_date, class_id, school_classes(name), created_at")
    .eq("business_id", businessId)
    .eq("year_id", yearId)
    .order("created_at");
  return data ?? [];
}

/** Per fee: invoices issued, billed, paid. Per student: billed, paid, balance (live invoices of the year's fees). */
export async function feeSummary(businessId: string, feeIds: string[]) {
  if (!feeIds.length) return { byFee: new Map<string, { invoices: number; billed: number; paid: number }>(), byStudent: new Map<string, { billed: number; paid: number }>() };
  const db = await createClient();
  const { data } = await db
    .from("documents")
    .select("fee_item_id, student_id, total, amount_paid")
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .neq("status", "voided")
    .in("fee_item_id", feeIds)
    .limit(20000);
  const byFee = new Map<string, { invoices: number; billed: number; paid: number }>();
  const byStudent = new Map<string, { billed: number; paid: number }>();
  for (const r of data ?? []) {
    const f = byFee.get(r.fee_item_id!) ?? { invoices: 0, billed: 0, paid: 0 };
    f.invoices += 1;
    f.billed += Number(r.total);
    f.paid += Number(r.amount_paid ?? 0);
    byFee.set(r.fee_item_id!, f);
    if (r.student_id) {
      const st = byStudent.get(r.student_id) ?? { billed: 0, paid: 0 };
      st.billed += Number(r.total);
      st.paid += Number(r.amount_paid ?? 0);
      byStudent.set(r.student_id, st);
    }
  }
  return { byFee, byStudent };
}
