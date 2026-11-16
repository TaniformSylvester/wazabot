import { z } from "zod";

import { currentUserIsPlatformAdmin } from "@/lib/admin/access";
import { clearTestChat, recordTestHandoff } from "@/lib/ai/test-handoff";
import { sendTestMessage } from "@/lib/ai/test-chat";
import { EVERYONE, MANAGERS, requireRole, roleErrorResponse } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * AI Assistant → Test chat, and the header's "Test AI Bot" simulator. A plain
 * JSON endpoint for owners and managers, and for the WazaBolt team (demos) in
 * any business they belong to. Up to 60 s: Claude may look things up first.
 *
 * With `queue: true` (the simulator), a test the assistant hands to the team
 * goes into the Live Handoff Queue as this member's TEST chat
 * (lib/ai/test-handoff.ts); DELETE clears it.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Owners and managers; or any member who is on the WazaBolt team. */
async function authorize() {
  const auth = await requireRole(MANAGERS);
  if (auth.ok || auth.status !== 403 || !(await currentUserIsPlatformAdmin())) return auth;
  return requireRole(EVERYONE);
}

const queueSchema = z.object({
  queue: z.literal(true),
  history: z.array(z.object({ role: z.enum(["customer", "assistant"]), text: z.string().max(4096) })).max(30),
  message: z.string().max(1000),
});

export async function POST(request: Request) {
  const started = Date.now();
  // 401 / 403 before anything else.
  const auth = await authorize();
  if (!auth.ok) return roleErrorResponse(auth);
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const result = await sendTestMessage(body, auth.ctx);
  // The simulator: a hand-over goes to the Live Handoff Queue (TEST), so the team sees and hears it.
  let queued = false;
  const q = queueSchema.safeParse(body);
  if (result.ok && result.needsHuman && q.success) {
    const admin = createAdminClient();
    if (admin) {
      queued = await recordTestHandoff(admin, {
        businessId: auth.ctx.business.id,
        userId: auth.ctx.user.id,
        userName: auth.ctx.user.fullName || auth.ctx.user.email || "team",
        transcript: [...q.data.history, { role: "customer", text: q.data.message || "[photo]" }, { role: "assistant", text: result.reply }],
        reason: result.handoffReason,
        language: result.language,
      });
    }
  }
  // Outcome and timing only — never the message text.
  console.info(`[ai.testChat] ${result.ok ? "ok" : result.error}${queued ? " queued" : ""} in ${Date.now() - started}ms`);
  return Response.json(result.ok ? { ...result, queued } : result, { headers: { "cache-control": "no-store" } });
}

/** "Clear test": removes this member's TEST chat from the queue and the inbox. */
export async function DELETE() {
  const auth = await authorize();
  if (!auth.ok) return roleErrorResponse(auth);
  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, error: "failed" }, { status: 503 });
  const ok = await clearTestChat(admin, auth.ctx.business.id, auth.ctx.user.id);
  return Response.json({ ok }, { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
