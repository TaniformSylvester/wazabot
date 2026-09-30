import type { LanguageCode } from "@/lib/i18n/languages";
import type { MediaRef } from "@/lib/messaging/types";

/**
 * Interfaces the processing pipeline depends on. Each has one server-side
 * implementation (or none yet); swapping providers never touches the
 * pipeline or the database. None of these may run in the browser.
 */

export type DownloadedMedia = {
  bytes: Uint8Array;
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
};

/** Fetches a media file from the channel (WhatsApp) with the server-side token. */
export interface MediaDownloader {
  download(ref: MediaRef): Promise<DownloadedMedia>;
}

/** Private media storage. Paths come from mediaStoragePath(); URLs are short-lived. */
export interface MediaStore {
  put(path: string, media: DownloadedMedia): Promise<void>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}

export type TranscriptionResult = {
  text: string;
  /** Language reported by the engine, when it maps to one of ours. */
  language?: LanguageCode | null;
  /** 0–1, when the engine reports one. */
  confidence?: number | null;
};

/**
 * Speech-to-text for voice notes. Not implemented yet: the engine must be
 * chosen for Cameroonian English, French and Pidgin (Pidgin support in
 * commercial engines is limited — evaluate on real voice notes first).
 */
export interface Transcriber {
  readonly provider: string;
  readonly model: string;
  transcribe(input: { bytes: Uint8Array; mimeType: string; languageHints: LanguageCode[] }): Promise<TranscriptionResult>;
}

export type CatalogMatch = {
  productId: string;
  name: string;
  /** 0–1: how sure the match is. Only confident matches may be quoted to customers. */
  confidence: number;
  /** Price, stock etc. come from the catalog row, never from the image. */
  price: number | null;
  currency: string;
  inStock: boolean | null;
};

/** Business catalog lookup (products arrive in Phase 3). Used by the AI's search_catalog tool. */
export interface CatalogSearch {
  search(businessId: string, query: { text?: string; limit?: number }): Promise<CatalogMatch[]>;
}

/** Raised by a dependency that isn't configured yet (e.g. no transcription provider). */
export class NotConfiguredError extends Error {
  constructor(readonly capability: string) {
    super(`${capability} is not configured`);
    this.name = "NotConfiguredError";
  }
}

/** Raised when media fails validation (type, size, checksum). The message never includes content. */
export class MediaRejectedError extends Error {
  constructor(readonly reason: "type" | "size" | "checksum" | "download") {
    super(`media rejected: ${reason}`);
    this.name = "MediaRejectedError";
  }
}
