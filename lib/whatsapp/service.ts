import "server-only";

/*
 * WhatsApp Business Platform (Cloud API) — what the server needs, in one place.
 *
 * Platform-level settings (one Meta app for WazaBolt), server env only:
 *   WHATSAPP_APP_SECRET            verifies X-Hub-Signature-256 on every webhook
 *   WHATSAPP_VERIFY_TOKEN          answers Meta's webhook verification challenge
 *   WHATSAPP_TOKEN_ENCRYPTION_KEY  encrypts each business's access token at rest
 *   SUPABASE_SERVICE_ROLE_KEY      webhook writes (no user session on Meta's calls)
 *
 * Per business (entered on Dashboard → WhatsApp by an owner/admin): Phone
 * Number ID, WhatsApp Business Account ID and an access token, verified
 * against the Graph API before anything is marked "connected".
 * Credentials never reach the browser.
 */

export type ConnectionStatus = "not_connected" | "connecting" | "connected" | "error";

export type PlatformReadiness = {
  appSecret: boolean;
  verifyToken: boolean;
  encryptionKey: boolean;
  serviceRole: boolean;
};

/** Which platform settings are present (booleans only — never the values). */
export function whatsappPlatformReadiness(): PlatformReadiness {
  return {
    appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
    verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    encryptionKey: Boolean(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function whatsappPlatformReady() {
  return Object.values(whatsappPlatformReadiness()).every(Boolean);
}

/** WhatsApp only allows free-form replies within 24 hours of the customer's last message. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowOpen(lastCustomerMessageAt: string | null | undefined, now = Date.now()) {
  if (!lastCustomerMessageAt) return false;
  return now - new Date(lastCustomerMessageAt).getTime() < CUSTOMER_SERVICE_WINDOW_MS;
}

/** Public webhook URL to paste into the Meta app (Webhooks → WhatsApp Business Account). */
export function webhookUrl() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${site}/api/whatsapp/webhook`;
}
