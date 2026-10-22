"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize } from "@/lib/auth/dal";
import { businessSnapshot, getDocumentSettings } from "@/lib/data/documents";
import { computeReportCards, getPublication, getSchoolSettings, schoolLanguage } from "@/lib/data/school";
import { renderReportCardsPdf, reportCardFileName } from "@/lib/documents/pdf/render";
import { logoFromStorageUrl } from "@/lib/documents/server";
import { sendPdfOnWhatsApp } from "@/lib/documents/whatsapp";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { MODULES } from "@/lib/modules";
import { gradingPreset, parseBoundaries, GRADING_PRESETS } from "@/lib/school/presets";
import { REPORT_LABELS } from "@/lib/school/report-card";
import { createClient } from "@/lib/supabase/server";
import { checkbox, money, normalizeWhatsAppNumber, optionalText, requiredText } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * WazaBolt Schools — every write checks the role here and again in the
 * database (RLS and the school functions): setup by owners/admins, students
 * by staff, marks by the subject's teacher or an admin, publishing and fees
 * by owners/admins.
 */

const path = (locale: string, p: string) => (isLocale(locale) ? localizePath(locale, p) : p);
const done = (id?: string) => {
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(id);
};
const failed = (where: string, error: { code?: string; message?: string } | null) => {
  logServerError(`school.${where}`, error);
  return fail(dbError(error));
};
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date").nullable());
const optionalUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid({ error: "invalid_option" }).nullable());
const number = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".").trim()) : v), z.number({ error: "invalid_number" }).min(min, "invalid_number").max(max, "invalid_number"));

// ---------------------------------------------------------------- module
export async function setModule(module: string, enabled: boolean): Promise<FormState> {
  if (!(MODULES as readonly string[]).includes(module)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_business_module", { p_business_id: ctx.business.id, p_module: module, p_enabled: enabled });
  if (error) return failed("module", error);
  return done();
}

// ---------------------------------------------------------------- settings
const settingsSchema = z.object({
  school_type: z.enum(["nursery", "primary", "secondary", "vocational", "higher", "other"], { error: "invalid_option" }),
  registration_number: optionalText(80),
  motto: optionalText(200),
  principal_name: optionalText(120),
  grading_preset: z.enum(["francophone_20", "anglophone_100", "primary", "custom"], { error: "invalid_option" }),
  scale_max: number(1, 1000),
  pass_mark: number(0, 1000),
  use_coefficients: checkbox,
  rank_students: checkbox,
  missing_marks: z.enum(["exclude", "zero"], { error: "invalid_option" }),
  grade_boundaries: z.string().max(2000, "too_long"),
  decimals: z.coerce.number({ error: "invalid_integer" }).int("invalid_integer").min(0, "invalid_integer").max(3, "invalid_integer"),
  report_template: z.enum(["classic", "modern"], { error: "invalid_option" }),
  report_language: z.preprocess((v) => (v === "" ? null : v), z.enum(["en", "fr"], { error: "invalid_option" }).nullable()),
  student_prefix: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z0-9]{1,8}$/, "invalid_prefix")),
});

export async function saveSchoolSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const boundaries = parseBoundaries(d.grade_boundaries);
  if (!boundaries) return fail("invalid", { grade_boundaries: ["invalid_boundaries"] });
  if (d.pass_mark > d.scale_max) return fail("invalid", { pass_mark: ["invalid_number"] });
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_settings")
    .upsert({ business_id: ctx.business.id, ...d, grade_boundaries: boundaries, updated_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) return failed("settings", error);
  return done();
}

/** Fills the grading settings from a preset (owners/admins). */
export async function applyGradingPreset(preset: string): Promise<FormState> {
  if (!(GRADING_PRESETS as readonly string[]).includes(preset)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const settings = await getSchoolSettings(ctx.business.id);
  const def = gradingPreset(preset as (typeof GRADING_PRESETS)[number], schoolLanguage(settings, ctx.business));
  const s = def.settings;
  const supabase = await createClient();
  const { error } = await supabase.from("school_settings").upsert(
    {
      business_id: ctx.business.id,
      grading_preset: preset,
      scale_max: s.scaleMax,
      pass_mark: s.passMark,
      use_coefficients: s.useCoefficients,
      rank_students: s.rankStudents,
      missing_marks: s.missingMarks,
      grade_boundaries: s.gradeBoundaries,
      decimals: s.decimals,
      school_type: preset === "primary" ? "primary" : settings.school_type,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  if (error) return failed("preset", error);
  return done();
}

// ---------------------------------------------------------------- years, terms, assessments
const yearSchema = z.object({
  name: requiredText(40),
  starts_on: optionalDate,
  ends_on: optionalDate,
  make_current: checkbox,
  with_preset: checkbox,
});

export async function createYear(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = yearSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const b = ctx.business.id;
  if (d.make_current) await supabase.from("academic_years").update({ is_current: false }).eq("business_id", b).eq("is_current", true);
  const { data: year, error } = await supabase
    .from("academic_years")
    .insert({ business_id: b, name: d.name, starts_on: d.starts_on, ends_on: d.ends_on, is_current: d.make_current })
    .select("id")
    .single();
  if (error || !year) return error?.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : failed("year", error);
  if (d.with_preset) {
    const settings = await getSchoolSettings(b);
    const preset = (GRADING_PRESETS as readonly string[]).includes(settings.grading_preset) ? (settings.grading_preset as (typeof GRADING_PRESETS)[number]) : "francophone_20";
    const def = gradingPreset(preset, schoolLanguage(settings, ctx.business));
    for (const [i, t] of def.terms.entries()) {
      const { data: term, error: termError } = await supabase.from("school_terms").insert({ business_id: b, year_id: year.id, name: t.name, position: i + 1 }).select("id").single();
      if (termError || !term) return failed("term", termError);
      const { error: aError } = await supabase
        .from("school_assessments")
        .insert(t.assessments.map((a, j) => ({ business_id: b, term_id: term.id, name: a.name, weight: a.weight, max_mark: a.maxMark, position: j + 1 })));
      if (aError) return failed("assessments", aError);
    }
  }
  return done(year.id);
}

export async function setCurrentYear(yearId: string): Promise<FormState> {
  if (!isUuid(yearId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  await supabase.from("academic_years").update({ is_current: false }).eq("business_id", ctx.business.id).eq("is_current", true);
  const { error } = await supabase.from("academic_years").update({ is_current: true }).eq("business_id", ctx.business.id).eq("id", yearId);
  if (error) return failed("currentYear", error);
  return done(yearId);
}

export async function addTerm(yearId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(yearId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ name: requiredText(40) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase.from("school_terms").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("year_id", yearId);
  const { error } = await supabase.from("school_terms").insert({ business_id: ctx.business.id, year_id: yearId, name: parsed.data.name, position: (count ?? 0) + 1 });
  if (error) return failed("term", error);
  return done();
}

export async function addAssessment(termId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(termId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ name: requiredText(40), weight: number(0.01, 1000), max_mark: number(0.01, 1000) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase.from("school_assessments").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("term_id", termId);
  const { error } = await supabase
    .from("school_assessments")
    .insert({ business_id: ctx.business.id, term_id: termId, ...parsed.data, position: Math.min(20, (count ?? 0) + 1) });
  if (error) return error.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : failed("assessment", error);
  return done();
}

/** Removes an assessment (and its marks) — not while a class's results for the term are published. */
export async function removeAssessment(assessmentId: string): Promise<FormState> {
  if (!isUuid(assessmentId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data: a } = await supabase.from("school_assessments").select("term_id").eq("business_id", ctx.business.id).eq("id", assessmentId).maybeSingle();
  if (!a) return fail("not_found");
  const { count } = await supabase.from("school_result_publications").select("id", { count: "exact", head: true }).eq("term_id", a.term_id).is("withdrawn_at", null);
  if (count) return fail("results_published");
  const { error } = await supabase.from("school_assessments").delete().eq("business_id", ctx.business.id).eq("id", assessmentId);
  if (error) return failed("removeAssessment", error);
  return done();
}

// ---------------------------------------------------------------- subjects and classes
export async function createSubject(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ name: requiredText(80), code: optionalText(12) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("school_subjects").insert({ business_id: ctx.business.id, ...parsed.data });
  if (error) return error.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : failed("subject", error);
  return done();
}

const classSchema = z.object({ name: requiredText(60), level: optionalText(40), class_teacher_id: optionalUuid });

export async function createClass(yearId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(yearId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = classSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("school_classes").insert({ business_id: ctx.business.id, year_id: yearId, ...parsed.data }).select("id").single();
  if (error || !data) return error?.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : failed("class", error);
  return done(data.id);
}

export async function updateClass(classId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(classId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = classSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("school_classes").update(parsed.data).eq("business_id", ctx.business.id).eq("id", classId);
  if (error) return error.code === "23505" ? fail("duplicate", { name: ["duplicate"] }) : failed("updateClass", error);
  return done(classId);
}

export async function addClassSubject(classId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(classId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ subject_id: z.uuid({ error: "required" }), coefficient: number(0.01, 100), teacher_id: optionalUuid }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase.from("class_subjects").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("class_id", classId);
  const { error } = await supabase.from("class_subjects").insert({ business_id: ctx.business.id, class_id: classId, ...parsed.data, position: Math.min(99, (count ?? 0) + 1) });
  if (error) return error.code === "23505" ? fail("duplicate", { subject_id: ["duplicate"] }) : failed("classSubject", error);
  return done();
}

export async function updateClassSubject(classSubjectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(classSubjectId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ coefficient: number(0.01, 100), teacher_id: optionalUuid }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("class_subjects").update(parsed.data).eq("business_id", ctx.business.id).eq("id", classSubjectId);
  if (error) return failed("updateClassSubject", error);
  return done(classSubjectId);
}

/** Removes a subject from a class (its marks go too) — not while the class has published results. */
export async function removeClassSubject(classSubjectId: string): Promise<FormState> {
  if (!isUuid(classSubjectId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data: cs } = await supabase.from("class_subjects").select("class_id").eq("business_id", ctx.business.id).eq("id", classSubjectId).maybeSingle();
  if (!cs) return fail("not_found");
  const { count } = await supabase.from("school_result_publications").select("id", { count: "exact", head: true }).eq("class_id", cs.class_id).is("withdrawn_at", null);
  if (count) return fail("results_published");
  const { error } = await supabase.from("class_subjects").delete().eq("business_id", ctx.business.id).eq("id", classSubjectId);
  if (error) return failed("removeClassSubject", error);
  return done();
}

// ---------------------------------------------------------------- students
const studentSchema = z.object({
  first_name: requiredText(80),
  last_name: requiredText(80),
  gender: z.preprocess((v) => (v === "" ? null : v), z.enum(["female", "male"], { error: "invalid_option" }).nullable()),
  date_of_birth: optionalDate,
  guardian_name: optionalText(120),
  guardian_phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? normalizeWhatsAppNumber(v) : null),
    z.string().regex(/^[0-9]{8,15}$/, "invalid_phone").nullable(),
  ),
  class_id: optionalUuid,
  status: z.enum(["active", "withdrawn", "graduated"], { error: "invalid_option" }).default("active"),
  notes: optionalText(1000),
});

/** The guardian as a customer (found by WhatsApp number, or created), so fees and report cards can reach them. */
async function guardianCustomer(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, phone: string | null, name: string | null) {
  if (!phone) return null;
  const { data: found } = await supabase.from("customers").select("id, name").eq("business_id", businessId).eq("whatsapp_phone", phone).maybeSingle();
  if (found) {
    if (!found.name && name) await supabase.from("customers").update({ name }).eq("business_id", businessId).eq("id", found.id);
    return found.id;
  }
  const { data, error } = await supabase.from("customers").insert({ business_id: businessId, whatsapp_phone: phone, name: name ?? undefined }).select("id").single();
  if (error) {
    logServerError("school.guardian", error);
    return null;
  }
  return data.id;
}

async function enrol(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, studentId: string, classId: string | null) {
  if (!classId) return null;
  const { data: klass } = await supabase.from("school_classes").select("year_id").eq("business_id", businessId).eq("id", classId).maybeSingle();
  if (!klass) return { code: "22023" };
  // One class per year: moving to another class of the same year replaces the enrolment.
  const { data: existing } = await supabase.from("school_enrollments").select("id").eq("business_id", businessId).eq("student_id", studentId).eq("year_id", klass.year_id).maybeSingle();
  const { error } = existing
    ? await supabase.from("school_enrollments").update({ class_id: classId, status: "enrolled" }).eq("id", existing.id)
    : await supabase.from("school_enrollments").insert({ business_id: businessId, student_id: studentId, class_id: classId, year_id: klass.year_id });
  return error;
}

export async function saveStudent(locale: string, studentId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  if (studentId !== null && !isUuid(studentId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = studentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { guardian_phone, class_id, ...d } = parsed.data;
  const b = ctx.business.id;
  const supabase = await createClient();
  const guardian = await guardianCustomer(supabase, b, guardian_phone, d.guardian_name);
  if (guardian_phone && !guardian) return fail("unknown");
  const row = { ...d, ...(guardian_phone ? { guardian_customer_id: guardian } : studentId ? {} : { guardian_customer_id: null }) };
  let id = studentId;
  if (studentId) {
    const { error } = await supabase.from("school_students").update(row).eq("business_id", b).eq("id", studentId);
    if (error) return failed("updateStudent", error);
  } else {
    const { data, error } = await supabase.from("school_students").insert({ business_id: b, ...row, created_by: ctx.user.id }).select("id").single();
    if (error || !data) return failed("createStudent", error);
    id = data.id;
  }
  const enrolError = await enrol(supabase, b, id!, class_id);
  if (enrolError) return failed("enrol", enrolError);
  revalidatePath("/[lang]/dashboard", "layout");
  if (!studentId) redirect(path(locale, `/dashboard/school/students/${id}?saved=1`));
  return ok(id!);
}

export async function enrolStudent(classId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(classId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const studentId = z.uuid().safeParse(formData.get("student_id"));
  if (!studentId.success) return fail("invalid", { student_id: ["required"] });
  const supabase = await createClient();
  const error = await enrol(supabase, ctx.business.id, studentId.data, classId);
  if (error) return failed("enrol", error);
  return done();
}

export async function unenrolStudent(enrollmentId: string): Promise<FormState> {
  if (!isUuid(enrollmentId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("school_enrollments").update({ status: "left" }).eq("business_id", ctx.business.id).eq("id", enrollmentId);
  if (error) return failed("unenrol", error);
  return done();
}

// ---------------------------------------------------------------- marks and comments
const marksSchema = z.object({
  rows: z
    .array(
      z.object({
        studentId: z.uuid(),
        marks: z.record(z.string(), z.union([z.number().min(0).max(1000), z.literal("abs"), z.null()])),
        comment: z.string().max(300).optional(),
      }),
    )
    .max(500),
});

/**
 * Saves a subject's marks for a term: one call per assessment (the database
 * checks the teacher, ranges, enrolment and that results aren't published),
 * then the teacher's comments.
 */
export async function saveSubjectMarks(classSubjectId: string, termId: string, input: unknown): Promise<FormState> {
  if (!isUuid(classSubjectId) || !isUuid(termId)) return fail("invalid");
  const ctx = await authorize("teacher");
  if (!ctx) return fail("forbidden");
  const parsed = marksSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { data: assessments } = await supabase.from("school_assessments").select("id").eq("business_id", ctx.business.id).eq("term_id", termId);
  for (const a of assessments ?? []) {
    const rows = parsed.data.rows
      .filter((r) => a.id in r.marks)
      .map((r) => {
        const m = r.marks[a.id];
        return { student_id: r.studentId, mark: m === "abs" ? null : m, absent: m === "abs" };
      });
    if (!rows.length) continue;
    const { error } = await supabase.rpc("save_marks", { p_class_subject_id: classSubjectId, p_assessment_id: a.id, p_rows: rows });
    if (error) {
      logServerError("school.marks", error);
      if (error.message?.includes("out of range")) return fail("invalid", undefined, error.message.match(/\(0 to ([\d.]+)\)/)?.[1]);
      return fail(dbError(error));
    }
  }
  for (const r of parsed.data.rows) {
    if (r.comment === undefined) continue;
    const { error } = await supabase.rpc("set_school_comment", { p_kind: "subject", p_term_id: termId, p_student_id: r.studentId, p_comment: r.comment, p_class_subject_id: classSubjectId });
    if (error) return failed("subjectComment", error);
  }
  return done(classSubjectId);
}

const commentSchema = z.object({
  kind: z.enum(["class_teacher", "principal"]),
  term_id: z.uuid(),
  student_id: z.uuid(),
  comment: z.string().max(500, "too_long"),
});

export async function saveTermComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("teacher");
  if (!ctx) return fail("forbidden");
  const parsed = commentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_school_comment", { p_kind: parsed.data.kind, p_term_id: parsed.data.term_id, p_student_id: parsed.data.student_id, p_comment: parsed.data.comment });
  if (error) return failed("termComment", error);
  return done();
}

// ---------------------------------------------------------------- publishing
/** Owners/admins: compute the class's results from the marks now and freeze them. */
export async function publishResults(classId: string, termId: string): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const data = await computeReportCards(ctx.business, classId, termId);
  if (!data) return fail("not_found");
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("publish_school_results", { p_term_id: termId, p_class_id: classId, p_results: data as never });
  if (error) return failed("publish", error);
  return done(id ?? undefined);
}

export async function withdrawResults(publicationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(publicationId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ reason: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(3, "reason_required").max(300, "too_long")) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_school_results", { p_publication_id: publicationId, p_reason: parsed.data.reason });
  if (error) return failed("withdraw", error);
  return done(publicationId);
}

/** Staff: a published report card to the student's guardian on WhatsApp (inside the 24-hour window). */
export async function sendReportCard(classId: string, termId: string, studentId: string): Promise<FormState> {
  if (!isUuid(classId) || !isUuid(termId) || !isUuid(studentId)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const pub = await getPublication(ctx.business.id, termId, classId);
  // Never before the results are published.
  if (!pub) return fail("not_found");
  const st = pub.data.students.find((s) => s.id === studentId);
  if (!st) return fail("not_found");
  const supabase = await createClient();
  const { data: student } = await supabase.from("school_students").select("guardian_customer_id").eq("business_id", ctx.business.id).eq("id", studentId).maybeSingle();
  if (!student?.guardian_customer_id) return fail("not_found");
  let pdf: Buffer;
  try {
    pdf = await renderReportCardsPdf(pub.data, { studentIds: [studentId], logo: await logoFromStorageUrl(ctx.business.logoUrl), branding: false });
  } catch (e) {
    logServerError("school.reportCard.pdf", e);
    return fail("unknown");
  }
  const L = REPORT_LABELS[pub.data.language];
  const r = await sendPdfOnWhatsApp({
    businessId: ctx.business.id,
    userId: ctx.user.id,
    customerId: student.guardian_customer_id,
    pdf,
    fileName: reportCardFileName(pub.data, st),
    caption: `${L.title} — ${st.name} — ${pub.data.term} — ${ctx.business.name}`,
    meta: { report_card: true, publication_id: pub.id, student_id: studentId },
  });
  if (!r.ok) return fail(r.error);
  return done(r.messageId);
}

// ---------------------------------------------------------------- fees
const feeSchema = z.object({ name: requiredText(80), amount: money.refine((v) => v > 0, "invalid_number"), class_id: optionalUuid, due_date: optionalDate });

export async function createFee(yearId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isUuid(yearId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = feeSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("school_fee_items").insert({ business_id: ctx.business.id, year_id: yearId, ...parsed.data });
  if (error) return failed("fee", error);
  return done();
}

/** Owners/admins: an invoice for the fee to every enrolled student without one (to their guardian). */
export async function billFee(feeId: string): Promise<FormState> {
  if (!isUuid(feeId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const docSettings = await getDocumentSettings(ctx.business.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_school_fee", { p_fee_item_id: feeId, p_business_snapshot: businessSnapshot(ctx.business, docSettings) });
  if (error) return failed("bill", error);
  return { ...done(feeId), value: String(data ?? 0) };
}
