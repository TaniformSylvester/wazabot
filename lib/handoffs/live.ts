import "server-only";

import { aiConfigured } from "@/lib/ai/claude";
import { businessCanUse } from "@/lib/billing/plan-access";
import { getAiSettingsRow, getWhatsAppConnection } from "@/lib/data/queries";

/**
 * For the dashboard (the member's session): does the AI assistant really
 * answer this business's WhatsApp chats? Launched by WazaBolt and in the
 * business's plan (add-on or trial), configured, switched on, number
 * connected. The handoff countdown and "AI Online" wording depend on it.
 */
export async function assistantLiveFor(businessId: string): Promise<boolean> {
  if (!aiConfigured()) return false;
  const [connection, settings, entitled] = await Promise.all([getWhatsAppConnection(businessId), getAiSettingsRow(businessId), businessCanUse(businessId, "ai_assistant")]);
  return connection?.status === "connected" && settings?.ai_enabled !== false && entitled;
}
