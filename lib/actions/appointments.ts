"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { authorize } from "@/lib/auth/dal";
import { localDate, localStamp, localTime } from "@/lib/business/time";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { notifyAppointment } from "@/lib/notifications/events";
import { runNotification } from "@/lib/notifications/run";
import { createClient } from "@/lib/supabase/server";
import { APPOINTMENT_STATUSES, appointmentSchema, bookingSettingsSchema, serviceSchema } from "@/lib/validation/app";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Appointments (Stage 6). Booking goes through book_appointment() in the
 * database (opening hours, notice, capacity, no double booking); settings
 * and services are owner/admin; status changes are agents and up.
 */

const revalidate = () => revalidatePath("/[lang]/dashboard", "layout");

export async function saveBookingSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = bookingSettingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { min_notice_hours, ...rest } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .update({ ...rest, min_notice_minutes: min_notice_hours * 60 })
    .eq("business_id", ctx.business.id)
    .select("business_id");
  if (error) {
    logServerError("appointments.settings", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  revalidate();
  return ok();
}

export async function saveService(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = serviceSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("services").update(parsed.data).eq("id", id).eq("business_id", ctx.business.id)
    : await supabase.from("services").insert({ ...parsed.data, business_id: ctx.business.id, currency: ctx.business.currency });
  if (error) {
    logServerError("appointments.service", error);
    return fail(dbError(error));
  }
  revalidate();
  return ok(isUuid(id) ? id : undefined);
}

export async function deleteService(serviceId: string): Promise<FormState> {
  if (!isUuid(serviceId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", serviceId).eq("business_id", ctx.business.id);
  if (error) {
    logServerError("appointments.serviceDelete", error);
    return fail(dbError(error));
  }
  revalidate();
  return ok();
}

/** Free local times ("10:00") for a service on a local date — for the booking form. */
export async function getFreeTimes(serviceId: string, date: string): Promise<string[]> {
  if (!isUuid(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const ctx = await authorize("agent");
  if (!ctx) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("available_slots", { p_business_id: ctx.business.id, p_service_id: serviceId, p_from: date, p_days: 1 });
  const tz = ctx.business.timezone;
  return (data ?? []).filter((s) => localDate(new Date(s.starts_at), tz) === date).map((s) => localTime(new Date(s.starts_at), tz));
}

export async function createAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const parsed = appointmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const supabase = await createClient();
  // Match the local time against the real free slots (no timezone maths from the browser).
  const { data: slots } = await supabase.rpc("available_slots", { p_business_id: ctx.business.id, p_service_id: a.service_id, p_from: a.starts_at.slice(0, 10), p_days: 1 });
  const slot = (slots ?? []).find((s) => localStamp(new Date(s.starts_at), ctx.business.timezone) === a.starts_at);
  if (!slot) return fail("slot_unavailable");
  const { data, error } = await supabase.rpc("book_appointment", {
    p_business_id: ctx.business.id,
    p_customer_id: a.customer_id,
    p_service_id: a.service_id,
    p_starts_at: slot.starts_at,
    p_conversation_id: a.conversation_id ?? undefined,
    p_notes: a.notes ?? undefined,
  });
  if (error || !data) {
    logServerError("appointments.book", error);
    return fail(error?.code === "WB410" ? "slot_unavailable" : dbError(error));
  }
  after(() => runNotification("appointments.notify", (admin) => notifyAppointment(admin, ctx.business.id, data, "appointment_booked")));
  revalidate();
  const locale = formData.get("locale");
  if (isLocale(locale)) redirect(localizePath(locale, `/dashboard/appointments?booked=1&day=${a.starts_at.slice(0, 10)}`));
  return ok(data);
}

export async function setAppointmentStatus(appointmentId: string, status: string): Promise<FormState> {
  if (!isUuid(appointmentId) || !(APPOINTMENT_STATUSES as readonly string[]).includes(status)) return fail("invalid");
  const ctx = await authorize("agent");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update({ status }).eq("id", appointmentId).eq("business_id", ctx.business.id).select("id");
  if (error) {
    logServerError("appointments.status", error);
    return fail(dbError(error));
  }
  if (!data?.length) return fail("not_found");
  if (status === "cancelled") after(() => runNotification("appointments.notify", (admin) => notifyAppointment(admin, ctx.business.id, appointmentId, "appointment_cancelled")));
  revalidate();
  return ok(appointmentId);
}
