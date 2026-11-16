import "server-only";

import { createHash } from "node:crypto";

import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/*
 * "Test AI Bot" hand-overs (supabase/migrations/…_test_chat_handoffs.sql):
 * when the simulator's assistant hands a test chat to the team, the chat
 * goes into the Live Handoff Queue as one "Test chat" conversation per
 * member, badged TEST. It is also is_sample, so it is never sent to
 * WhatsApp and never counted; it leaves the queue when resolved, and
 * "Clear test" deletes it.
 */

export type TestTurn = { role: "customer" | "assistant"; text: string };

/** A stable, fake-but-valid reference and number for this member's test customer. */
function testIdentity(userId: string) {
  const digits = BigInt(`0x${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`).toString().padStart(9, "0");
  return { reference: `SAMPLE-9${digits.slice(-5)}`, phone: `999${digits.slice(-9)}` };
}

/** Puts this transcript in the member's test conversation and hands it to the team (the queue's chime fires). */
export async function recordTestHandoff(
  admin: Admin,
  args: { businessId: string; userId: string; userName: string; transcript: TestTurn[]; reason: string | null; language: string | null },
): Promise<boolean> {
  try {
    const { reference, phone } = testIdentity(args.userId);
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

    let { data: customer } = await admin.from("customers").select("id").eq("business_id", args.businessId).eq("reference", reference).eq("is_test", true).maybeSingle();
    if (!customer) {
      const { data, error } = await admin
        .from("customers")
        .insert({ business_id: args.businessId, reference, whatsapp_phone: phone, name: `Test chat · ${args.userName}`.slice(0, 120), is_sample: true, is_test: true, first_contact_at: iso(0), last_contact_at: iso(0) })
        .select("id")
        .single();
      if (error) throw error;
      customer = data;
    }

    let { data: conversation } = await admin.from("conversations").select("id").eq("business_id", args.businessId).eq("customer_id", customer.id).eq("is_test", true).limit(1).maybeSingle();
    if (!conversation) {
      const { data, error } = await admin
        .from("conversations")
        .insert({ business_id: args.businessId, customer_id: customer.id, status: "open", ai_enabled: true, is_sample: true, is_test: true, language: args.language })
        .select("id")
        .single();
      if (error) throw error;
      conversation = data;
    }

    // The latest test replaces the previous one: the transcript as the simulator shows it.
    await admin.from("messages").delete().eq("business_id", args.businessId).eq("conversation_id", conversation.id);
    const turns = args.transcript.slice(-30);
    const { error: me } = await admin.from("messages").insert(
      turns.map((t, i) => ({
        business_id: args.businessId,
        conversation_id: conversation.id,
        direction: t.role === "customer" ? "inbound" : "outbound",
        sender_type: t.role === "customer" ? "customer" : "ai",
        message_type: "text",
        content: t.text.slice(0, 4096),
        language: args.language,
        processing_status: "processed",
        created_at: iso((turns.length - i) * 1000),
      })),
    );
    if (me) throw me;

    const lastCustomer = [...turns].reverse().findIndex((t) => t.role === "customer");
    const { error: ue } = await admin
      .from("conversations")
      .update({
        status: "pending",
        ai_enabled: false,
        human_requested: true,
        unread_count: Math.max(1, turns.filter((t) => t.role === "customer").length),
        last_message_at: iso(1000),
        last_customer_message_at: iso((lastCustomer + 1) * 1000),
        handoff_expires_at: new Date(now + 30 * 60_000).toISOString(),
        ai_summary: args.reason ? `TEST — ${args.reason}`.slice(0, 800) : "TEST — handed over by the assistant",
        updated_at: iso(0),
      })
      .eq("id", conversation.id)
      .eq("business_id", args.businessId);
    if (ue) throw ue;
    return true;
  } catch (e) {
    logServerError("ai.testHandoff", e);
    return false;
  }
}

/** "Clear test": removes this member's test chat (customer, conversation and its messages). */
export async function clearTestChat(admin: Admin, businessId: string, userId: string): Promise<boolean> {
  const { reference } = testIdentity(userId);
  const { error } = await admin.from("customers").delete().eq("business_id", businessId).eq("reference", reference).eq("is_test", true);
  if (error) logServerError("ai.testHandoff.clear", error);
  return !error;
}
