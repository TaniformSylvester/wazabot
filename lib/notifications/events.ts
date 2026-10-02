import "server-only";

import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

import { notify, type NotifyResult } from "./service";
import { templateLanguageFor, type NotificationKind, type TemplateLanguage } from "./templates";

/*
 * What triggers a customer notification (Stage 7):
 *   - an order moves to confirmed / ready / out for delivery / delivered (dashboard),
 *   - an appointment is booked or cancelled from the dashboard,
 *   - the day-before reminder (daily job, /api/cron/reminders),
 *   - a team member asks to follow up after the 24-hour window.
 * Each respects the business's notification settings.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const ORDER_KINDS: Record<string, NotificationKind> = {
  confirmed: "order_confirmed",
  ready: "order_ready",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
};

const locales: Record<TemplateLanguage, string> = { en: "en-GB", fr: "fr-FR" };

function formatMoney(amount: number, currency: string, language: TemplateLanguage) {
  return `${new Intl.NumberFormat(locales[language], { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

/** "Sat 3 Oct, 10:00" / "sam. 3 oct., 10:00" in the business's timezone. */
function formatWhen(iso: string, timeZone: string, language: TemplateLanguage) {
  return new Intl.DateTimeFormat(locales[language], { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const fallbackName: Record<TemplateLanguage, string> = { en: "there", fr: "cher client" };

async function settingsFor(admin: Admin, businessId: string) {
  const { data } = await admin.from("notification_settings").select("order_updates, appointment_updates, appointment_reminders").eq("business_id", businessId).maybeSingle();
  return data ?? { order_updates: true, appointment_updates: true, appointment_reminders: true };
}

/** After an order's status changed. */
export async function notifyOrderStatus(admin: Admin, businessId: string, orderId: string): Promise<NotifyResult | null> {
  const { data: o } = await admin
    .from("orders")
    .select("id, status, order_number, total, currency, customer_id, customers(name, preferred_language), businesses(name, default_language)")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();
  const kind = o ? ORDER_KINDS[o.status] : undefined;
  if (!o || !kind) return null;
  if (!(await settingsFor(admin, businessId)).order_updates) return null;
  const language = templateLanguageFor(o.customers?.preferred_language, o.businesses?.default_language ?? "en");
  return notify(admin, {
    businessId,
    kind,
    customerId: o.customer_id,
    orderId: o.id,
    eventKey: `order:${o.id}:${o.status}`,
    values: {
      customer: o.customers?.name || fallbackName[language],
      business: o.businesses?.name ?? "",
      order: o.order_number,
      total: formatMoney(Number(o.total), o.currency, language),
    },
  });
}

/** Appointment booked, cancelled or reminded. */
export async function notifyAppointment(admin: Admin, businessId: string, appointmentId: string, kind: "appointment_booked" | "appointment_cancelled" | "appointment_reminder") {
  const { data: a } = await admin
    .from("appointments")
    .select("id, status, service_name, starts_at, customer_id, customers(name, preferred_language), businesses(name, default_language, timezone)")
    .eq("id", appointmentId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!a) return null;
  const settings = await settingsFor(admin, businessId);
  if (kind === "appointment_reminder" ? !settings.appointment_reminders : !settings.appointment_updates) return null;
  const language = templateLanguageFor(a.customers?.preferred_language, a.businesses?.default_language ?? "en");
  return notify(admin, {
    businessId,
    kind,
    customerId: a.customer_id,
    appointmentId: a.id,
    eventKey: `appointment:${a.id}:${kind}`,
    values: {
      customer: a.customers?.name || fallbackName[language],
      service: a.service_name,
      business: a.businesses?.name ?? "",
      when: formatWhen(a.starts_at, a.businesses?.timezone ?? "Africa/Douala", language),
    },
  });
}

/**
 * Reminders for appointments starting between 2 and 30 hours from now (run
 * daily in the evening, that's "tomorrow"); each is sent once.
 */
export async function sendDueReminders(admin: Admin, now = new Date()) {
  const { data } = await admin
    .from("appointments")
    .select("id, business_id")
    .in("status", ["booked", "confirmed"])
    .gt("starts_at", new Date(now.getTime() + 2 * 3_600_000).toISOString())
    .lte("starts_at", new Date(now.getTime() + 30 * 3_600_000).toISOString())
    .order("starts_at")
    .limit(1000);
  const tally = { sent: 0, skipped: 0, failed: 0, duplicate: 0 };
  for (const a of data ?? []) {
    try {
      const r = await notifyAppointment(admin, a.business_id, a.id, "appointment_reminder");
      if (r) tally[r.status]++;
    } catch (e) {
      tally.failed++;
      logServerError("notifications.reminder", e);
    }
  }
  return tally;
}

/** "Follow up" after the 24-hour window: the follow-up template, at most once a day per conversation. */
export async function notifyFollowUp(admin: Admin, businessId: string, conversationId: string, now = new Date()) {
  const { data: c } = await admin
    .from("conversations")
    .select("id, customer_id, customers(name, preferred_language), businesses(name, default_language)")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!c) return null;
  const language = templateLanguageFor(c.customers?.preferred_language, c.businesses?.default_language ?? "en");
  return notify(admin, {
    businessId,
    kind: "follow_up",
    customerId: c.customer_id,
    eventKey: `follow_up:${c.id}:${now.toISOString().slice(0, 10)}`,
    values: { customer: c.customers?.name || fallbackName[language], business: c.businesses?.name ?? "" },
  });
}
