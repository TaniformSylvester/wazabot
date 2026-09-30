/**
 * WazaBolt message model — channel-neutral types shared by the WhatsApp
 * webhook, the processing pipeline, the AI layer and the dashboard.
 * Mirrors `messages.message_type` and the media tables in
 * supabase/migrations/20260930120000_multimodal_messages.sql.
 */

export const MESSAGE_TYPES = ["text", "image", "audio", "document", "video", "location"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MEDIA_KINDS = ["image", "audio", "document", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type ProcessingStatus = "received" | "processing" | "processed" | "failed" | "unsupported";

/** A media file as announced by the channel — not downloaded yet. */
export type MediaRef = {
  kind: MediaKind;
  /** Channel media id (WhatsApp: download once with the server-side token). */
  channelMediaId: string;
  mimeType: string;
  sha256?: string;
  /** WhatsApp voice notes recorded in the app. */
  isVoice?: boolean;
  filename?: string;
};

type InboundBase = {
  /** Channel message id (WhatsApp "wamid…"), used for idempotency. */
  channelMessageId: string;
  /** Customer's WhatsApp id (phone number digits). */
  from: string;
  /** Customer profile name, if WhatsApp sent one. */
  profileName?: string;
  /** Business phone number id the message was sent to (identifies the business). */
  toPhoneNumberId: string;
  receivedAt: Date;
  /** Id of the message this one replies to, if any. */
  replyToChannelMessageId?: string;
};

export type InboundMessage =
  | (InboundBase & { type: "text"; text: string })
  | (InboundBase & { type: "image"; media: MediaRef; caption?: string })
  | (InboundBase & { type: "audio"; media: MediaRef })
  | (InboundBase & { type: "document"; media: MediaRef; caption?: string })
  | (InboundBase & { type: "video"; media: MediaRef; caption?: string })
  | (InboundBase & { type: "location"; location: LocationPayload })
  /** Stickers, reactions, contacts, polls … recorded but not answered by the AI. */
  | (InboundBase & { type: "unsupported"; channelType: string });

export type LocationPayload = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

/** Maps an inbound message to the stored message_type ("unsupported" has none of its own). */
export function storedMessageType(message: InboundMessage): MessageType | null {
  return message.type === "unsupported" ? null : message.type;
}
