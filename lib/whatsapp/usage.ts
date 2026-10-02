import "server-only";

import type { WhatsAppCategory } from "@/config/economics";
import { logServerError } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Counts one outbound WhatsApp message Meta accepted, per number, month and
 * pricing category (whatsapp_usage). Free-form text inside the 24-hour window
 * is a service message; templates are utility or marketing. Best effort: a
 * failed count never blocks the message.
 */
export async function recordWhatsAppSend(admin: Admin, businessId: string, phoneNumberId: string, category: WhatsAppCategory) {
  const { error } = await admin.rpc("record_whatsapp_send", { p_business_id: businessId, p_phone_number_id: phoneNumberId, p_category: category });
  if (error) logServerError("whatsapp.usage", error);
}
