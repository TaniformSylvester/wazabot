import "server-only";

import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Runs a notification with the service-role client (needed for the WhatsApp token); never throws. */
export async function runNotification(context: string, fn: (admin: Admin) => Promise<{ status: string; reason?: string } | null>) {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const r = await fn(admin);
    if (r) console.info(`[${context}] ${r.status}${r.reason ? ` (${r.reason})` : ""}`);
  } catch (e) {
    logServerError(context, e);
  }
}
