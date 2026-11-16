import "server-only";

import { siteConfig } from "@/config/site";
import { emailLayout, esc, sendEmail } from "@/lib/email/send";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SIGNUP_VERTICALS, type SignupVertical } from "@/lib/validation/auth-rules";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type WaitlistLead = {
  id: string;
  business_name: string;
  whatsapp_number: string;
  email: string;
  vertical: string;
  country_code: string | null;
  locale: string;
  created_at: string;
  invited_at: string | null;
  invite_expires_at: string | null;
  joined_at: string | null;
  /** The beta link was sent but has expired unused. */
  invite_expired: boolean;
};

/** ?vertical= on the admin page and the export: one vertical, or all. */
export function adminVertical(value: unknown): SignupVertical | null {
  return typeof value === "string" && (SIGNUP_VERTICALS as readonly string[]).includes(value) ? (value as SignupVertical) : null;
}

/** Beta waitlist leads, newest first (WazaBolt team only: the caller checked platform_admins). */
export async function listWaitlistLeads(admin: Admin, vertical: SignupVertical | null, limit = 5000): Promise<WaitlistLead[]> {
  let q = admin.from("waitlist_leads").select("id, business_name, whatsapp_number, email, vertical, country_code, locale, created_at, invited_at, invite_expires_at, joined_at").order("created_at", { ascending: false }).limit(limit);
  if (vertical) q = q.eq("vertical", vertical);
  const { data } = await q;
  const now = Date.now();
  return (data ?? []).map((l) => ({ ...l, invite_expired: !l.joined_at && !!l.invite_expires_at && Date.parse(l.invite_expires_at) < now }));
}

/** How many leads per vertical. */
export async function waitlistCounts(admin: Admin): Promise<Record<SignupVertical, number>> {
  const counts = await Promise.all(
    SIGNUP_VERTICALS.map(async (v) => [v, (await admin.from("waitlist_leads").select("id", { count: "exact", head: true }).eq("vertical", v)).count ?? 0] as const),
  );
  return Object.fromEntries(counts) as Record<SignupVertical, number>;
}

const VERTICAL_LABEL: Record<string, string> = { shop: "Shop", restaurant: "Restaurant", school: "School" };

/**
 * Email to the WazaBolt team inbox when a new lead joins the beta waitlist
 * (not for repeats or bots): who they are, and a link to the waitlist page to
 * send their beta invite. Skipped quietly when email isn't set up.
 */
export async function notifyTeamOfWaitlistLead(lead: { businessName: string; whatsappNumber: string; email: string; vertical: string; country?: string | null; locale?: string | null }) {
  const link = `${siteConfig.url.replace(/\/$/, "")}/en/admin/waitlist?vertical=${encodeURIComponent(lead.vertical)}`;
  const type = VERTICAL_LABEL[lead.vertical] ?? lead.vertical;
  const rows: [string, string][] = [
    ["Business", esc(lead.businessName)],
    ["Type", esc(type)],
    ["WhatsApp", `<a href="https://wa.me/${esc(lead.whatsappNumber)}">+${esc(lead.whatsappNumber)}</a>`],
    ["Email", esc(lead.email)],
    ["Country", esc(lead.country ?? "—")],
    ["Language", lead.locale === "fr" ? "French" : "English"],
  ];
  await sendEmail({
    to: siteConfig.email.teamInbox,
    subject: `[WazaBolt] New beta waitlist lead – ${lead.businessName} (${type})`,
    html: emailLayout({
      title: "New beta waitlist lead",
      intro: `<b>${esc(lead.businessName)}</b> joined the early-access beta waitlist. Send their beta invite from the waitlist page (it opens WhatsApp with their personal sign-up link).`,
      rows,
      button: { label: "Open the waitlist", href: link },
      footer: "You receive this because you are on the WazaBolt team.",
    }),
    text: `New beta waitlist lead\n\n${lead.businessName} (${type})\nWhatsApp: +${lead.whatsappNumber}\nEmail: ${lead.email}\nCountry: ${lead.country ?? "—"}\n\nSend their beta invite: ${link}`,
  });
}
