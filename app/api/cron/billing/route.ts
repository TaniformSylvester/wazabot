import { runDailyBilling } from "@/lib/billing/daily";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Prepaid billing and cost alerts (Step 4), called daily by Vercel Cron
 * (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET" when
 * CRON_SECRET is set; anything else is refused. See lib/billing/daily.ts.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const tally = await runDailyBilling(admin);
  console.info(`[cron.billing] paymentDue=${tally.paymentDue} downgraded=${tally.downgraded} reminders=${tally.reminders} budgetAlerts=${tally.budgetAlerts} spendJump=${tally.spendJump}`);
  return Response.json({ ok: true, ...tally });
}
