"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/dal";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { documentSchema, faqSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

type Table = "faqs" | "knowledge_documents";
const TABLES: readonly Table[] = ["faqs", "knowledge_documents"];

function done(formData: FormData, tab: "faqs" | "documents") {
  revalidatePath("/[lang]/dashboard", "layout");
  const locale = formData.get("locale");
  if (isLocale(locale) && formData.get("redirect") !== "stay") redirect(localizePath(locale, `/dashboard/knowledge?tab=${tab}&saved=1`));
}

export async function saveFaq(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = faqSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return fail("invalid");
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("faqs").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id)
    : await supabase.from("faqs").insert({ ...parsed.data, business_id: ctx.business.id });
  if (error) {
    logServerError("knowledge.saveFaq", error);
    return fail(dbError(error));
  }
  done(formData, "faqs");
  return ok(id || undefined);
}

export async function saveDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = documentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return fail("invalid");
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("knowledge_documents").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id)
    : await supabase.from("knowledge_documents").insert({ ...parsed.data, business_id: ctx.business.id });
  if (error) {
    logServerError("knowledge.saveDocument", error);
    return fail(dbError(error));
  }
  done(formData, "documents");
  return ok(id || undefined);
}

export async function setKnowledgeActive(table: Table, id: string, active: boolean): Promise<FormState> {
  if (!TABLES.includes(table) || !isUuid(id)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ active }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return fail(dbError(error));
  revalidatePath("/[lang]/dashboard", "layout");
  return ok(id);
}

export async function deleteKnowledge(table: Table, id: string): Promise<FormState> {
  if (!TABLES.includes(table) || !isUuid(id)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) {
    logServerError("knowledge.delete", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard", "layout");
  return ok();
}
