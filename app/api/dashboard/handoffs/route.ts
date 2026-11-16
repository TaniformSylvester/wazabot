import { EVERYONE, requireRole, roleErrorResponse } from "@/lib/auth/requireRole";
import type { HandoffItem, HandoffState } from "@/lib/handoffs/alerts";
import { getBusinessModules } from "@/lib/modules";
import { resumeIdleHandoffs } from "@/lib/handoffs/resume";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * The live handoff queue for the dashboard's watcher (components/dashboard/
 * handoff-alerts.tsx), polled every few seconds: how many WhatsApp threads
 * wait for a person, and the latest ones. A few hundred bytes, never cached.
 *
 * Members who work the inbox only (owners, managers, staff); teachers and
 * kitchen staff never see conversations. Scoped to the verified current
 * business; read with the member's own session, so RLS applies too.
 */
const MAX_ITEMS = 20;
const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const check = await requireRole(EVERYONE, { access: "read", readOnlyOk: true });
  if (!check.ok) return roleErrorResponse(check);
  const { business } = check.ctx;
  if (business.role === "teacher" || business.role === "kitchen") return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!(await getBusinessModules(business)).includes("ai")) return Response.json({ ok: true, count: 0, items: [] } satisfies HandoffState & { ok: true }, { headers: NO_STORE });

  // The failsafe's light cleanup, while someone has the dashboard open: idle threads past their
  // 30 minutes (the team spoke last) go back to the assistant — only where it really answers.
  const admin = createAdminClient();
  if (admin) await resumeIdleHandoffs(admin, business.id, 10);

  const db = await createClient();
  const { data, count, error } = await db
    .from("conversations")
    .select("id, created_at, last_customer_message_at, human_requested, is_test, customers(name, whatsapp_phone)", { count: "exact" })
    .eq("business_id", business.id)
    .in("status", ["open", "pending"])
    // Real chats waiting for a person, and "Test AI Bot" hand-overs (TEST); never the sample chats.
    .or("and(is_sample.eq.false,or(human_requested.eq.true,ai_enabled.eq.false)),and(is_test.eq.true,or(human_requested.eq.true,ai_enabled.eq.false))")
    .order("last_customer_message_at", { ascending: false, nullsFirst: false })
    .limit(MAX_ITEMS);
  if (error) return Response.json({ ok: false, error: "failed" }, { status: 500, headers: NO_STORE });

  const items: HandoffItem[] = (data ?? []).map((c) => ({
    id: c.id,
    name: c.customers?.name || (c.customers?.whatsapp_phone ? `+${c.customers.whatsapp_phone}` : ""),
    at: c.last_customer_message_at ?? c.created_at,
    requested: c.human_requested,
    ...(c.is_test ? { test: true } : {}),
  }));
  return Response.json({ ok: true, count: count ?? items.length, items } satisfies HandoffState & { ok: true }, { headers: NO_STORE });
}
