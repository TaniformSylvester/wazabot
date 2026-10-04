import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Whether the WazaBolt team has paused this business's assistant (kill switch). Read server-side only. */
export async function aiPausedByWazaBolt(businessId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("platform_business_controls").select("ai_paused").eq("business_id", businessId).maybeSingle();
  return Boolean(data?.ai_paused);
}
