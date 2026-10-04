import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { localizePath } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * The WazaBolt team's own pages (/admin/…). Access is the platform_admins
 * table, added to by hand in the SQL editor; everyone else gets a 404 so the
 * pages' existence isn't revealed.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export async function isPlatformAdmin(admin: Admin, userId: string) {
  const { data } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

/** Whether the signed-in user is on the WazaBolt team (memoised per request). */
export const currentUserIsPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  const admin = createAdminClient();
  return Boolean(user && admin && (await isPlatformAdmin(admin, user.id)));
});

/** For admin pages: the service-role client, or a redirect to log in / a 404. */
export async function requirePlatformAdmin(locale: Locale, path: string): Promise<Admin> {
  const user = await getCurrentUser();
  if (!user) redirect(localizePath(locale, `/login?next=${encodeURIComponent(localizePath(locale, path))}`));
  const admin = createAdminClient();
  if (!admin || !(await isPlatformAdmin(admin, user.id))) notFound();
  return admin;
}
