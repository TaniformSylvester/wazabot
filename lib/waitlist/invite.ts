import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
 * Beta invites (supabase/migrations/…_waitlist_beta_invites.sql): a personal
 * sign-up link for one waitlist lead, sent by the WazaBolt team on WhatsApp.
 * It opens sign-up while the waitlist is on, for that lead's email only,
 * for 14 days, once. Only the link's sha256 is stored.
 */
export const BETA_INVITE_DAYS = 14;

export const hashBetaToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export function newBetaToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashBetaToken(token) };
}

export type BetaInvite = { id: string; email: string; vertical: string; country_code: string | null; business_name: string };

/**
 * What a beta link is: "valid" (current: not replaced, not expired, not used),
 * "used" (the lead already created their account with it), or "invalid".
 */
export async function betaInviteState(admin: Admin, token: unknown): Promise<{ state: "valid" | "used"; invite: BetaInvite } | { state: "invalid"; invite: null }> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { state: "invalid", invite: null };
  const { data } = await admin
    .from("waitlist_leads")
    .select("id, email, vertical, country_code, business_name, invite_expires_at, joined_at")
    .eq("invite_token_hash", hashBetaToken(token))
    .maybeSingle();
  if (!data) return { state: "invalid", invite: null };
  const invite = { id: data.id, email: data.email, vertical: data.vertical, country_code: data.country_code, business_name: data.business_name };
  if (data.joined_at) return { state: "used", invite };
  if (!data.invite_expires_at || Date.parse(data.invite_expires_at) <= Date.now()) return { state: "invalid", invite: null };
  return { state: "valid", invite };
}

/** The lead a beta link belongs to, if the link can still be used to sign up. */
export async function findBetaInvite(admin: Admin, token: unknown): Promise<BetaInvite | null> {
  const r = await betaInviteState(admin, token);
  return r.state === "valid" ? r.invite : null;
}
