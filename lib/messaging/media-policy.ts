import type { MediaKind } from "@/lib/messaging/types";

/**
 * What media WazaBolt accepts, how big it may be and where it is stored.
 * Limits follow the WhatsApp Cloud API's own maximums; anything else is
 * rejected before download.
 */
export const MEDIA_LIMITS: Record<MediaKind, { maxBytes: number; mimeTypes: readonly string[] }> = {
  image: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  audio: {
    maxBytes: 16 * 1024 * 1024,
    mimeTypes: ["audio/ogg", "audio/opus", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"],
  },
  video: { maxBytes: 16 * 1024 * 1024, mimeTypes: ["video/mp4", "video/3gpp"] },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ],
  },
};

export const MEDIA_BUCKET = "whatsapp-media";

/** Signed URLs for the dashboard are valid this long. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/** Default retention: media is deleted after this many days (transcripts and analyses stay). */
export const MEDIA_RETENTION_DAYS = 90;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

export function isAllowedMedia(kind: MediaKind, mimeType: string, sizeBytes?: number): boolean {
  const limits = MEDIA_LIMITS[kind];
  if (!limits.mimeTypes.includes(mimeType)) return false;
  return sizeBytes === undefined || (sizeBytes >= 0 && sizeBytes <= limits.maxBytes);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Private storage path: <business_id>/<message_id>/<media_id>.<ext>.
 * Built only from ids we generated — never from customer-supplied filenames.
 */
export function mediaStoragePath(businessId: string, messageId: string, mediaId: string, mimeType: string): string {
  for (const id of [businessId, messageId, mediaId]) {
    if (!UUID.test(id)) throw new Error("mediaStoragePath: ids must be UUIDs");
  }
  return `${businessId}/${messageId}/${mediaId}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

export function retentionDeadline(from: Date, days = MEDIA_RETENTION_DAYS): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
