import type { LanguageCode } from "@/lib/i18n/languages";
import type { LocationPayload, MessageType, ProcessingStatus } from "@/lib/messaging/types";

/**
 * What the dashboard needs to show one message. Built server-side from the
 * messages / message_media / message_transcriptions rows; media URLs are
 * short-lived signed URLs (getSignedMediaUrl), never storage paths.
 */
export type MessageView = {
  id: string;
  type: MessageType;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "agent" | "system";
  createdAt: string;
  processingStatus: ProcessingStatus;
  /** Typed text, or the caption for media. */
  text: string | null;
  language: LanguageCode | null;
  media: {
    signedUrl: string | null;
    mimeType: string;
    isVoice: boolean;
    durationSeconds: number | null;
    filename: string | null;
  } | null;
  transcript: {
    status: "pending" | "completed" | "failed" | "not_enabled";
    text: string | null;
    language: LanguageCode | null;
  } | null;
  location: LocationPayload | null;
};

/** Reads a stored location payload defensively (it is jsonb). */
export function locationFromPayload(payload: Record<string, unknown> | null | undefined): LocationPayload | null {
  const lat = payload?.latitude;
  const lng = payload?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    latitude: lat,
    longitude: lng,
    name: typeof payload?.name === "string" ? payload.name : undefined,
    address: typeof payload?.address === "string" ? payload.address : undefined,
  };
}

export function mapsUrl({ latitude, longitude }: LocationPayload) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
