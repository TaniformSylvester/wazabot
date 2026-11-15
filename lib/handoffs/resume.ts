import "server-only";

import { aiConfigured } from "@/lib/ai/claude";
import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Minutes a chat stays with the team, after the handoff or their last reply (supabase/migrations/…_handoff_failsafe.sql). */
export const HANDOFF_MINUTES = 30;

/**
 * Does the AI assistant really answer for this business right now? Launched
 * by WazaBolt, configured, switched on in the business's settings, and not
 * paused by the WazaBolt team. Until then nothing is handed back to it:
 * a chat stays with the team, in the queue.
 */
export async function assistantAnswers(admin: Admin, businessId: string): Promise<boolean> {
  if (!aiConfigured()) return false;
  const [launched, settings, control] = await Promise.all([
    admin.rpc("ai_assistant_launched"),
    admin.from("ai_settings").select("ai_enabled").eq("business_id", businessId).maybeSingle(),
    admin.from("platform_business_controls").select("ai_paused").eq("business_id", businessId).maybeSingle(),
  ]);
  return launched.data === true && settings.data?.ai_enabled !== false && !control.data?.ai_paused;
}

/**
 * The light cleanup: threads with the team whose 30 minutes are up and where
 * the team spoke last (the customer isn't waiting) go back to the assistant,
 * with a note. A thread whose last message is the customer's stays in the
 * queue until they write again (then the assistant takes it on arrival).
 * One business (from its dashboard), or every business (the daily job).
 */
export async function resumeIdleHandoffs(admin: Admin, businessId: string | null = null, limit = 50): Promise<number> {
  try {
    let q = admin
      .from("conversations")
      .select("id, business_id")
      .lt("handoff_expires_at", new Date().toISOString())
      .eq("is_sample", false)
      .in("status", ["open", "pending"])
      .limit(limit);
    if (businessId) q = q.eq("business_id", businessId);
    const { data } = await q;
    if (!data?.length) return 0;
    const live = new Map<string, boolean>();
    let resumed = 0;
    for (const c of data) {
      if (!live.has(c.business_id)) live.set(c.business_id, await assistantAnswers(admin, c.business_id));
      if (!live.get(c.business_id)) continue;
      const { data: last } = await admin
        .from("messages")
        .select("direction")
        .eq("business_id", c.business_id)
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.direction === "inbound") continue;
      const { data: ok } = await admin.rpc("resume_ai_after_idle", { p_conversation_id: c.id });
      if (ok) resumed++;
    }
    return resumed;
  } catch (e) {
    logServerError("handoffs.resumeIdle", e);
    return 0;
  }
}
