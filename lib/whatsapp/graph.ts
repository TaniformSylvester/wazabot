import "server-only";

/*
 * Minimal WhatsApp Cloud API client (Meta Graph API), server-side only.
 * The access token is sent in the Authorization header and never logged or
 * included in errors. Base URL and version are configurable so tests can
 * point at a local fake of the Graph API.
 */

export const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
export const GRAPH_API_BASE_URL = (process.env.WHATSAPP_GRAPH_API_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");

/** A Graph API error, reduced to what's safe to store and show (no token, no payload). */
export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    readonly title: string,
  ) {
    super(`WhatsApp API error ${code ?? status}: ${title}`);
    this.name = "GraphApiError";
  }

  /** Short, safe summary for logs / last_error, e.g. "131047 Re-engagement message". */
  get summary() {
    return `${this.code ?? this.status} ${this.title}`.slice(0, 200);
  }

  /** Token invalid, expired or missing permissions. */
  get isAuthError() {
    return this.code === 190 || this.code === 10 || this.code === 200 || this.status === 401;
  }

  /** Outside the 24-hour customer-service window: only templates may be sent. */
  get isWindowClosed() {
    return this.code === 131047;
  }
}

type Fetch = typeof fetch;

export type PhoneNumberDetails = { id: string; displayPhoneNumber: string; verifiedName: string; qualityRating: string | null };

export class WhatsAppGraphClient {
  constructor(
    private readonly accessToken: string,
    private readonly options: { baseUrl?: string; version?: string; fetchImpl?: Fetch } = {},
  ) {}

  private url(path: string) {
    return `${this.options.baseUrl ?? GRAPH_API_BASE_URL}/${encodeURIComponent(this.options.version ?? GRAPH_API_VERSION)}/${path}`;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await (this.options.fetchImpl ?? fetch)(this.url(path), {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_user_title?: string } } & T;
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      throw new GraphApiError(res.status, typeof e.code === "number" ? e.code : null, String(e.error_user_title || e.message || res.statusText || "request failed").slice(0, 150));
    }
    return json;
  }

  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumberDetails> {
    const r = await this.request<{ id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      "GET",
      `${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
    );
    return { id: r.id, displayPhoneNumber: r.display_phone_number ?? "", verifiedName: r.verified_name ?? "", qualityRating: r.quality_rating ?? null };
  }

  /** Phone number ids that belong to the WhatsApp Business Account. */
  async listPhoneNumberIds(wabaId: string): Promise<string[]> {
    const r = await this.request<{ data?: { id: string }[] }>("GET", `${encodeURIComponent(wabaId)}/phone_numbers?fields=id`);
    return (r.data ?? []).map((p) => p.id);
  }

  /** Subscribes the app that owns the token to the account's webhooks (messages, statuses). */
  async subscribeApp(wabaId: string): Promise<void> {
    await this.request("POST", `${encodeURIComponent(wabaId)}/subscribed_apps`);
  }

  async sendText(phoneNumberId: string, to: string, body: string, replyToMessageId?: string): Promise<{ messageId: string }> {
    const r = await this.request<{ messages?: { id: string }[] }>("POST", `${encodeURIComponent(phoneNumberId)}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    });
    const messageId = r.messages?.[0]?.id;
    if (!messageId) throw new GraphApiError(502, null, "no message id returned");
    return { messageId };
  }

  /** Blue ticks for the customer: marks an inbound message as read. */
  async markRead(phoneNumberId: string, messageId: string): Promise<void> {
    await this.request("POST", `${encodeURIComponent(phoneNumberId)}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId });
  }

  /** Short-lived download URL + metadata for a media id. */
  async getMedia(mediaId: string): Promise<{ url?: string; mime_type?: string; file_size?: number; sha256?: string }> {
    return this.request("GET", encodeURIComponent(mediaId));
  }

  /** Downloads bytes from a URL returned by getMedia (same token). */
  async downloadUrl(url: string): Promise<Uint8Array> {
    const res = await (this.options.fetchImpl ?? fetch)(url, { headers: { Authorization: `Bearer ${this.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new GraphApiError(res.status, null, "media download failed");
    return new Uint8Array(await res.arrayBuffer());
  }
}
