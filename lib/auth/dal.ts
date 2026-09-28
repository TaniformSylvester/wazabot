import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { BusinessRole } from "@/types/database";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
};

export type CurrentBusiness = {
  id: string;
  name: string;
  role: BusinessRole;
  countryCode: string;
  currency: string;
  timezone: string;
  languages: string[];
  onboardingCompletedAt: string | null;
};

/** The signed-in user, verified with the Auth server. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Always per-request: auth state must never be baked in at build time.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase.from("users").select("full_name").eq("id", data.user.id).maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile?.full_name || (data.user.user_metadata?.full_name as string | undefined) || "",
  };
});

/** Use in any protected page, layout, Server Action or Route Handler. */
export async function requireUser(next = "/dashboard") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * The business the user belongs to. Row Level Security guarantees only the
 * user's own memberships are returned. Phase 2 assumes one business per user.
 */
export const getCurrentBusiness = cache(async (): Promise<CurrentBusiness | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_members")
    .select("role, businesses(id, name, country_code, currency, timezone, languages, onboarding_completed_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const b = data?.businesses;
  if (!data || !b) return null;
  return {
    id: b.id,
    name: b.name,
    role: data.role,
    countryCode: b.country_code,
    currency: b.currency,
    timezone: b.timezone,
    languages: b.languages,
    onboardingCompletedAt: b.onboarding_completed_at,
  };
});
