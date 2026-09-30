import "server-only";

import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, tokenHint } from "@/lib/whatsapp/crypto";
import { GraphApiError, WhatsAppGraphClient } from "@/lib/whatsapp/graph";
import { whatsappPlatformReady } from "@/lib/whatsapp/service";
import type { Json, TablesUpdate } from "@/types/database";

/*
 * Connecting a business's WhatsApp number. Runs on the server with the
 * service role, only after the caller's role was checked (owner/admin).
 * Nothing is marked "connected" until Meta confirms the number and the
 * account, and the webhook subscription succeeded.
 */

export type ConnectInput = { phoneNumberId: string; wabaId: string; accessToken: string };

export type ConnectError =
  | "not_configured" // platform env missing (service role, encryption key, app secret, verify token)
  | "number_in_use" // already connected to another WazaBolt business
  | "not_in_account" // the number doesn't belong to that WhatsApp Business Account
  | "token_invalid" // Meta rejected the token or its permissions
  | "verify_failed"; // any other Graph API failure

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type GraphFactory = (token: string) => WhatsAppGraphClient;
const defaultGraph: GraphFactory = (token) => new WhatsAppGraphClient(token);

async function setState(admin: Admin, businessId: string, values: TablesUpdate<"whatsapp_connections">) {
  const { error } = await admin.from("whatsapp_connections").update(values).eq("business_id", businessId);
  if (error) throw error;
}

async function audit(admin: Admin, businessId: string, userId: string, action: string, metadata: Record<string, Json> = {}) {
  await admin.from("audit_logs").insert({ business_id: businessId, actor_user_id: userId, action, entity_type: "whatsapp_connection", entity_id: businessId, metadata });
}

export async function connectWhatsApp(
  businessId: string,
  userId: string,
  input: ConnectInput,
  graph: GraphFactory = defaultGraph,
): Promise<{ ok: true; displayPhoneNumber: string; verifiedName: string } | { ok: false; error: ConnectError }> {
  const admin = createAdminClient();
  if (!admin || !whatsappPlatformReady()) return { ok: false, error: "not_configured" };

  // A number can serve one business only (it routes incoming messages).
  const { data: taken } = await admin
    .from("whatsapp_connections")
    .select("business_id")
    .eq("phone_number_id", input.phoneNumberId)
    .neq("business_id", businessId)
    .maybeSingle();
  if (taken) return { ok: false, error: "number_in_use" };

  await setState(admin, businessId, { status: "connecting", last_error: null });
  const client = graph(input.accessToken);
  try {
    const ids = await client.listPhoneNumberIds(input.wabaId);
    if (!ids.includes(input.phoneNumberId)) {
      await setState(admin, businessId, { status: "error", last_error: "Phone number not found in this WhatsApp Business Account" });
      return { ok: false, error: "not_in_account" };
    }
    const phone = await client.getPhoneNumber(input.phoneNumberId);
    await client.subscribeApp(input.wabaId);

    const { error: credError } = await admin.from("whatsapp_credentials").upsert({
      business_id: businessId,
      access_token_encrypted: encryptSecret(input.accessToken),
      token_hint: tokenHint(input.accessToken),
    });
    if (credError) throw credError;
    await setState(admin, businessId, {
      status: "connected",
      phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId,
      display_phone_number: phone.displayPhoneNumber || null,
      verified_name: phone.verifiedName || null,
      connected_at: new Date().toISOString(),
      last_error: null,
    });
    await audit(admin, businessId, userId, "whatsapp.connected", { phone_number_id: input.phoneNumberId });
    return { ok: true, displayPhoneNumber: phone.displayPhoneNumber, verifiedName: phone.verifiedName };
  } catch (e) {
    const graphError = e instanceof GraphApiError ? e : null;
    logServerError("whatsapp.connect", graphError ? { code: String(graphError.code ?? graphError.status), message: graphError.title } : e);
    await setState(admin, businessId, { status: "error", last_error: graphError ? graphError.summary : "Connection failed" }).catch(() => undefined);
    // The unique index on phone_number_id can still race with another business.
    if ((e as { code?: string })?.code === "23505") return { ok: false, error: "number_in_use" };
    return { ok: false, error: graphError?.isAuthError ? "token_invalid" : "verify_failed" };
  }
}

export async function disconnectWhatsApp(businessId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("whatsapp_credentials").delete().eq("business_id", businessId);
  if (error) {
    logServerError("whatsapp.disconnect", error);
    return false;
  }
  await setState(admin, businessId, {
    status: "not_connected",
    phone_number_id: null,
    waba_id: null,
    display_phone_number: null,
    verified_name: null,
    connected_at: null,
    last_error: null,
  });
  await audit(admin, businessId, userId, "whatsapp.disconnected");
  return true;
}

export type BusinessWhatsApp = { businessId: string; phoneNumberId: string; client: WhatsAppGraphClient };

/** The connected number and a Graph client with the business's decrypted token (server-only, per call). */
export async function whatsappForBusiness(businessId: string, graph: GraphFactory = defaultGraph): Promise<BusinessWhatsApp | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [{ data: conn }, { data: cred }] = await Promise.all([
    admin.from("whatsapp_connections").select("status, phone_number_id").eq("business_id", businessId).maybeSingle(),
    admin.from("whatsapp_credentials").select("access_token_encrypted").eq("business_id", businessId).maybeSingle(),
  ]);
  if (!conn || conn.status !== "connected" || !conn.phone_number_id || !cred) return null;
  try {
    return { businessId, phoneNumberId: conn.phone_number_id, client: graph(decryptSecret(cred.access_token_encrypted)) };
  } catch (e) {
    logServerError("whatsapp.decrypt", e);
    return null;
  }
}

/** Last characters of the stored token, for display to the business's own members. Call only after checking membership. */
export async function storedTokenHint(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("whatsapp_credentials").select("token_hint").eq("business_id", businessId).maybeSingle();
  return data?.token_hint ?? null;
}
