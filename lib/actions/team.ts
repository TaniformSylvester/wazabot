"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import { ACTIVE_BUSINESS_COOKIE, authorize, getCurrentUser, listMyBusinesses } from "@/lib/auth/dal";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { logServerError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

import { dbError, fail, formObject, invalid, isUuid, ok, type FormState } from "./form";

/*
 * Team (Stage 4): invitation links, roles, removing members, leaving, and
 * switching between businesses. The rules (who may invite or change whom)
 * are enforced by the database functions; these actions only shape input.
 */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("email_invalid")),
  role: z.enum(["admin", "agent", "viewer"]),
});

/** A new link secret: only its sha256 is stored, so the link can be shown once (or renewed). */
function newToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

const inviteUrl = (locale: Locale, token: string) => `${siteConfig.url}${localizePath(locale, `/invite/${token}`)}`;
const localeOf = (v: FormDataEntryValue | string | null | undefined): Locale => (isLocale(v) ? v : "en");

const ACTIVE_BUSINESS_MAX_AGE = 60 * 60 * 24 * 365;

async function setActiveBusiness(businessId: string) {
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: ACTIVE_BUSINESS_MAX_AGE });
}

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const parsed = inviteSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { token, hash } = newToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invitation", {
    p_business_id: ctx.business.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: hash,
  });
  if (error) {
    logServerError("team.invite", error);
    return fail(error.code === "23505" ? "already_member" : dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return { ...ok(), value: inviteUrl(localeOf(formData.get("locale")), token) };
}

/** A fresh link for a pending invitation (the old link stops working). */
export async function renewInvitation(invitationId: string, locale: string): Promise<FormState> {
  if (!isUuid(invitationId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const { token, hash } = newToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_invitation", { p_invitation_id: invitationId, p_token_hash: hash });
  if (error) {
    logServerError("team.renewInvite", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return { ...ok(invitationId), value: inviteUrl(localeOf(locale), token) };
}

export async function revokeInvitation(invitationId: string): Promise<FormState> {
  if (!isUuid(invitationId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) {
    logServerError("team.revokeInvite", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return ok(invitationId);
}

export async function updateMemberRole(userId: string, role: string): Promise<FormState> {
  if (!isUuid(userId) || !["admin", "agent", "viewer"].includes(role)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_role", { p_business_id: ctx.business.id, p_user_id: userId, p_role: role });
  if (error) {
    logServerError("team.role", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return ok(userId);
}

export async function removeMember(userId: string): Promise<FormState> {
  if (!isUuid(userId)) return fail("invalid");
  const ctx = await authorize("admin");
  if (!ctx) return fail("forbidden");
  if (userId === ctx.user.id) return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_business_id: ctx.business.id, p_user_id: userId });
  if (error) {
    logServerError("team.remove", error);
    return fail(dbError(error));
  }
  revalidatePath("/[lang]/dashboard/team", "page");
  return ok(userId);
}

/** Leave the current business (not the owner). Goes to another business, or to the invitation-free landing. */
export async function leaveBusiness(locale: string): Promise<FormState> {
  const ctx = await authorize("viewer");
  if (!ctx) return fail("forbidden");
  if (ctx.business.role === "owner") return fail("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_business_id: ctx.business.id, p_user_id: ctx.user.id });
  if (error) {
    logServerError("team.leave", error);
    return fail(dbError(error));
  }
  (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(localizePath(localeOf(locale), "/dashboard"));
}

/** Business switcher: remember the choice, then reload the dashboard for that business. */
export async function switchBusiness(businessId: string, locale: string) {
  const mine = await listMyBusinesses();
  if (isUuid(businessId) && mine.some((b) => b.id === businessId)) await setActiveBusiness(businessId);
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(localizePath(localeOf(locale), "/dashboard"));
}

/** Signed-in user accepts an invitation sent to their email, then works in that business. */
export async function acceptInvitation(token: string, locale: string): Promise<FormState> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return fail("invite_invalid");
  const user = await getCurrentUser();
  if (!user) return fail("forbidden");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !data) {
    logServerError("team.accept", error);
    return fail(error?.code === "42501" ? "invite_wrong_email" : "invite_invalid");
  }
  await setActiveBusiness(data);
  revalidatePath("/[lang]/dashboard", "layout");
  redirect(localizePath(localeOf(locale), "/dashboard?joined=1"));
}
