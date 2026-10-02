import { createHmac, timingSafeEqual } from "node:crypto";

import type { InboundMessage, MediaKind, MediaRef } from "@/lib/messaging/types";

/**
 * WhatsApp Business Platform (Cloud API) webhook helpers.
 *
 * Payload shape (abridged):
 *   { object: "whatsapp_business_account",
 *     entry: [{ changes: [{ field: "messages", value: {
 *       metadata: { phone_number_id },
 *       contacts: [{ wa_id, profile: { name } }],
 *       messages: [{ id, from, timestamp, type, text | image | audio | document | video | location, context? }] } }] }] }
 *
 * Parsing is pure and defensive: unknown or malformed entries are skipped,
 * never thrown, so one odd message can't block a whole delivery.
 */

/**
 * Verifies Meta's `X-Hub-Signature-256` header (HMAC-SHA256 of the raw body
 * with the app secret). Always verify before trusting a webhook payload.
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const MEDIA_TYPES: MediaKind[] = ["image", "audio", "document", "video"];

function mediaRef(kind: MediaKind, raw: Json | null): MediaRef | null {
  const id = str(raw?.id);
  const mimeType = str(raw?.mime_type);
  if (!raw || !id || !mimeType) return null;
  return {
    kind,
    channelMediaId: id,
    mimeType: mimeType.split(";")[0].trim().toLowerCase(),
    sha256: str(raw.sha256),
    isVoice: kind === "audio" ? raw.voice === true : undefined,
    filename: kind === "document" ? str(raw.filename) : undefined,
  };
}

/** Extracts inbound customer messages from a webhook payload. Status updates are ignored. */
export function parseWebhookMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const root = obj(payload);
  if (root?.object !== "whatsapp_business_account") return out;

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const c = obj(change);
      if (c?.field !== "messages") continue;
      const value = obj(c.value);
      const toPhoneNumberId = str(obj(value?.metadata)?.phone_number_id);
      if (!value || !toPhoneNumberId) continue;

      const names = new Map<string, string>();
      for (const contact of arr(value.contacts)) {
        const waId = str(obj(contact)?.wa_id);
        const name = str(obj(obj(contact)?.profile)?.name);
        if (waId && name) names.set(waId, name);
      }

      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const channelMessageId = str(msg?.id);
        const from = str(msg?.from);
        const type = str(msg?.type);
        if (!msg || !channelMessageId || !from || !type) continue;

        const seconds = Number(msg.timestamp);
        const base = {
          channelMessageId,
          from,
          profileName: names.get(from),
          toPhoneNumberId,
          receivedAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
          replyToChannelMessageId: str(obj(msg.context)?.id),
        };

        if (type === "text") {
          const text = str(obj(msg.text)?.body);
          if (text) out.push({ ...base, type: "text", text });
          continue;
        }
        if ((MEDIA_TYPES as string[]).includes(type)) {
          const kind = type as MediaKind;
          const raw = obj(msg[kind]);
          const media = mediaRef(kind, raw);
          if (!media) {
            out.push({ ...base, type: "unsupported", channelType: type });
            continue;
          }
          const caption = str(raw?.caption);
          if (kind === "audio") out.push({ ...base, type: "audio", media });
          else out.push({ ...base, type: kind, media, caption });
          continue;
        }
        if (type === "location") {
          const loc = obj(msg.location);
          const latitude = num(loc?.latitude);
          const longitude = num(loc?.longitude);
          if (latitude !== undefined && longitude !== undefined) {
            out.push({ ...base, type: "location", location: { latitude, longitude, name: str(loc?.name), address: str(loc?.address) } });
          } else {
            out.push({ ...base, type: "unsupported", channelType: type });
          }
          continue;
        }
        out.push({ ...base, type: "unsupported", channelType: type });
      }
    }
  }
  return out;
}

export type DeliveryStatusUpdate = {
  /** Business phone number id the message was sent from. */
  phoneNumberId: string;
  /** Outbound message id (wamid) the status is about. */
  channelMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  at: Date;
  /** "131047 Re-engagement message" — code and title only, never content. */
  error?: string;
  /** Meta's pricing for the message (status "sent"/"delivered"): category, billable, type ("regular", "free_customer_service" …). */
  pricing?: { category: string | null; billable: boolean | null; type: string | null };
};

const STATUSES = ["sent", "delivered", "read", "failed"] as const;

/** Extracts delivery receipts (sent / delivered / read / failed) for outbound messages. */
export function parseWebhookStatuses(payload: unknown): DeliveryStatusUpdate[] {
  const out: DeliveryStatusUpdate[] = [];
  const root = obj(payload);
  if (root?.object !== "whatsapp_business_account") return out;
  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const c = obj(change);
      if (c?.field !== "messages") continue;
      const value = obj(c.value);
      const phoneNumberId = str(obj(value?.metadata)?.phone_number_id);
      if (!value || !phoneNumberId) continue;
      for (const s of arr(value.statuses)) {
        const st = obj(s);
        const channelMessageId = str(st?.id);
        const status = str(st?.status);
        if (!st || !channelMessageId || !status || !(STATUSES as readonly string[]).includes(status)) continue;
        const seconds = Number(st.timestamp);
        const err = obj(arr(st.errors)[0]);
        const pricing = obj(st.pricing);
        out.push({
          phoneNumberId,
          channelMessageId,
          status: status as DeliveryStatusUpdate["status"],
          at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
          error: err ? `${num(err.code) ?? ""} ${str(err.title) ?? str(err.message) ?? ""}`.trim().slice(0, 200) : undefined,
          ...(pricing
            ? { pricing: { category: str(pricing.category)?.slice(0, 40) ?? null, billable: typeof pricing.billable === "boolean" ? pricing.billable : null, type: str(pricing.type)?.slice(0, 40) ?? null } }
            : {}),
        });
      }
    }
  }
  return out;
}
