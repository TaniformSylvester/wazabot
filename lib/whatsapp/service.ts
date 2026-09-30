import "server-only";

import { NotConfiguredError } from "@/lib/messaging/ports";

/*
 * WhatsApp Business Platform boundary. Stage 2 implements this with the
 * official Cloud API (webhook in app/api/whatsapp/webhook, Embedded Signup,
 * token storage server-side). Until then every method refuses clearly —
 * nothing in the app may claim a connection that doesn't exist.
 *
 * Credentials (access token, app secret) live only in server environment
 * variables / server-side storage and are never sent to the browser.
 */

export type ConnectionStatus = "not_connected" | "connecting" | "connected" | "error";

export type PhoneNumberInfo = {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  wabaId: string;
};

export interface WhatsAppService {
  /** Starts Meta's Embedded Signup for the business (Stage 2). */
  beginConnection(businessId: string): Promise<{ redirectUrl: string }>;
  /** Completes the connection after Meta redirects back. */
  completeConnection(businessId: string, code: string): Promise<PhoneNumberInfo>;
  disconnect(businessId: string): Promise<void>;
  /** Sends a text reply inside the 24-hour customer service window. */
  sendText(businessId: string, toWhatsAppNumber: string, text: string): Promise<{ channelMessageId: string }>;
}

export const whatsappNotConfigured: WhatsAppService = {
  async beginConnection() {
    throw new NotConfiguredError("whatsapp");
  },
  async completeConnection() {
    throw new NotConfiguredError("whatsapp");
  },
  async disconnect() {
    throw new NotConfiguredError("whatsapp");
  },
  async sendText() {
    throw new NotConfiguredError("whatsapp");
  },
};

/** True when the server has the platform credentials Stage 2 needs (checked server-side only). */
export function whatsappEnvConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}
