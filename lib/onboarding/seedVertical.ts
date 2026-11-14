import "server-only";

import { getCountryPack } from "@/lib/i18n/country-packs";
import { logServerError } from "@/lib/log";
import { sampleContent } from "@/lib/onboarding/sample-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * Seeds a new workspace with sample data for its business type (products or
 * menu items — subjects for a school —, two WhatsApp conversations with one
 * waiting for a person, three FAQ templates), all marked is_sample. Called
 * right after a workspace is created (lib/actions/businesses.ts).
 *
 * Server-side only: the signed-in user must own the business (checked with
 * their own session) before anything is written with the service role, and
 * every row is written for that business only. A business that already has
 * products, customers or FAQs is never seeded. Failures are logged and never
 * stop the workspace from opening.
 */
export async function seedVertical(businessId: string): Promise<{ seeded: boolean }> {
  try {
    const db = await createClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { seeded: false };
    const { data: member } = await db.from("business_members").select("role").eq("business_id", businessId).eq("user_id", auth.user.id).maybeSingle();
    if (member?.role !== "owner") return { seeded: false };

    const admin = createAdminClient();
    if (!admin) return { seeded: false };
    const { data: business } = await admin.from("businesses").select("id, industry, currency, country_code, default_language").eq("id", businessId).maybeSingle();
    if (!business) return { seeded: false };

    // Only an empty workspace: never mix samples into a business that already has its own data.
    const [p, c, f] = await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      admin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      admin.from("faqs").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    ]);
    if ((p.count ?? 0) + (c.count ?? 0) + (f.count ?? 0) > 0) return { seeded: false };

    const content = sampleContent(business.industry, business.default_language, business.currency);
    const language = business.default_language === "fr" ? "fr" : "en";
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

    if (content.products.length) {
      const { error } = await admin.from("products").insert(
        content.products.map((item) => ({
          business_id: businessId,
          name: item.name,
          category: item.category,
          description: item.description,
          price: item.price,
          currency: business.currency,
          stock_quantity: item.stock,
          is_sample: true,
        })),
      );
      if (error) throw error;
    }
    if (content.subjects.length) {
      const { error } = await admin.from("school_subjects").insert(content.subjects.map((name) => ({ business_id: businessId, name, is_sample: true })));
      if (error) throw error;
    }

    // Numbers that can't be dialled (the subscriber part starts with 0); nothing is ever sent to them.
    const dial = getCountryPack(business.country_code).dialCode;
    for (const [i, conv] of content.conversations.entries()) {
      const first = conv.messages[0];
      const last = conv.messages[conv.messages.length - 1];
      const lastFromCustomer = [...conv.messages].reverse().find((m) => m.from === "customer") ?? first;
      const { data: customer, error: ce } = await admin
        .from("customers")
        .insert({ business_id: businessId, reference: `SAMPLE-${i + 1}`, whatsapp_phone: `${dial}00000000${i + 1}`, name: conv.customerName, first_contact_at: at(first.minutesAgo), last_contact_at: at(last.minutesAgo), is_sample: true })
        .select("id")
        .single();
      if (ce || !customer) throw ce;
      const { data: conversation, error: ve } = await admin
        .from("conversations")
        .insert({
          business_id: businessId,
          customer_id: customer.id,
          status: "open",
          language,
          // Waiting for a person: in the live queue, the assistant kept out of it.
          human_requested: conv.handoff,
          ai_enabled: !conv.handoff,
          unread_count: last.from === "customer" ? 1 : 0,
          last_message_at: at(last.minutesAgo),
          last_customer_message_at: at(lastFromCustomer.minutesAgo),
          is_sample: true,
        })
        .select("id")
        .single();
      if (ve || !conversation) throw ve;
      const { error: me } = await admin.from("messages").insert(
        conv.messages.map((m) => ({
          business_id: businessId,
          conversation_id: conversation.id,
          direction: m.from === "customer" ? "inbound" : "outbound",
          sender_type: m.from === "customer" ? "customer" : "agent",
          message_type: "text",
          content: m.text,
          language,
          created_at: at(m.minutesAgo),
        })),
      );
      if (me) throw me;
    }

    const { error: fe } = await admin.from("faqs").insert(content.faqs.map((faq) => ({ business_id: businessId, question: faq.question, answer: faq.answer, category: faq.category, is_sample: true })));
    if (fe) throw fe;
    return { seeded: true };
  } catch (e) {
    logServerError("onboarding.seedVertical", e);
    return { seeded: false };
  }
}
