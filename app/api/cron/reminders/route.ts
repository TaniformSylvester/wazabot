import { resumeBroadcasts } from "@/lib/broadcasts/service";
import { sendDueReminders } from "@/lib/notifications/events";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Appointment reminders (Stage 7), called daily by Vercel Cron (vercel.json).
 * Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set;
 * anything else is refused. Each reminder is sent once.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const tally = await sendDueReminders(admin);
  // Broadcasts interrupted by a time limit carry on here.
  await resumeBroadcasts(admin, Date.now() + 200_000);
  console.info(`[cron.reminders] sent=${tally.sent} skipped=${tally.skipped} failed=${tally.failed} duplicate=${tally.duplicate}`);
  return Response.json({ ok: true, ...tally });
}
