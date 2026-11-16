"use server";

import { revalidatePath } from "next/cache";

import { siteConfig } from "@/config/site";
import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { format } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/load";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { BETA_INVITE_DAYS, newBetaToken } from "@/lib/waitlist/invite";

import { isUuid } from "./form";

export type BetaInviteResult = { ok: true; whatsappUrl: string; link: string } | { ok: false; error: "forbidden" | "not_found" | "joined" | "failed" };

/**
 * WazaBolt team: a personal beta sign-up link for one waitlist lead, and the
 * WhatsApp message carrying it (wa.me, in the lead's language) for the team
 * to send in one tap. A new invite replaces the previous link. Nothing is
 * sent from here: WhatsApp opens with the message ready.
 */
export async function createBetaInvite(leadId: string): Promise<BetaInviteResult> {
  const admin = createAdminClient();
  if (!admin || !(await currentUserIsPlatformAdmin())) return { ok: false, error: "forbidden" };
  if (!isUuid(leadId)) return { ok: false, error: "not_found" };
  const { data: lead } = await admin.from("waitlist_leads").select("id, business_name, whatsapp_number, vertical, locale, joined_at").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, error: "not_found" };
  if (lead.joined_at) return { ok: false, error: "joined" };

  const { token, hash } = newBetaToken();
  const expires = new Date(Date.now() + BETA_INVITE_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("waitlist_leads").update({ invite_token_hash: hash, invited_at: new Date().toISOString(), invite_expires_at: expires }).eq("id", lead.id);
  if (error) {
    logServerError("waitlist.invite", error);
    return { ok: false, error: "failed" };
  }

  const locale = lead.locale === "fr" ? "fr" : "en";
  const w = (await getDictionary(locale)).waitlist;
  const vertical = (["shop", "restaurant", "school"] as const).find((v) => v === lead.vertical) ?? "shop";
  const link = `${siteConfig.url}${localizePath(locale, `/register?beta=${token}`)}`;
  const text = format(w.invite.message, { business: lead.business_name, days: String(BETA_INVITE_DAYS), link, sendUs: w.invite.sendUs[vertical], setup: w.done.setup[vertical] });
  revalidatePath("/[lang]/admin/waitlist", "page");
  return { ok: true, link, whatsappUrl: `https://wa.me/${lead.whatsapp_number}?text=${encodeURIComponent(text)}` };
}
