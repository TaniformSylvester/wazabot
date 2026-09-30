import "server-only";

import { createHash } from "node:crypto";

import { isAllowedMedia } from "@/lib/messaging/media-policy";
import { MediaRejectedError, NotConfiguredError, type DownloadedMedia, type MediaDownloader } from "@/lib/messaging/ports";
import type { MediaRef } from "@/lib/messaging/types";

type Fetch = typeof fetch;

/**
 * Downloads WhatsApp media with the Cloud API, server-side only:
 *   1. GET https://graph.facebook.com/<version>/<media-id>  → short-lived URL + metadata
 *   2. GET <url> with the same Bearer token                 → bytes
 * The access token never leaves the server and is never logged. Files are
 * checked against the allowed types/sizes and WhatsApp's checksum.
 */
export class WhatsAppMediaDownloader implements MediaDownloader {
  constructor(
    private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
    private readonly apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0",
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async download(ref: MediaRef): Promise<DownloadedMedia> {
    if (!this.accessToken) throw new NotConfiguredError("whatsapp_media");
    const auth = { Authorization: `Bearer ${this.accessToken}` };

    const metaRes = await this.fetchImpl(
      `https://graph.facebook.com/${encodeURIComponent(this.apiVersion)}/${encodeURIComponent(ref.channelMediaId)}`,
      { headers: auth, cache: "no-store" },
    );
    if (!metaRes.ok) throw new MediaRejectedError("download");
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number; sha256?: string };
    const mimeType = (meta.mime_type ?? ref.mimeType).split(";")[0].trim().toLowerCase();
    if (!meta.url || !/^https:\/\//.test(meta.url)) throw new MediaRejectedError("download");
    if (!isAllowedMedia(ref.kind, mimeType)) throw new MediaRejectedError("type");
    if (meta.file_size !== undefined && !isAllowedMedia(ref.kind, mimeType, meta.file_size)) throw new MediaRejectedError("size");

    const fileRes = await this.fetchImpl(meta.url, { headers: auth, cache: "no-store" });
    if (!fileRes.ok) throw new MediaRejectedError("download");
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (!isAllowedMedia(ref.kind, mimeType, bytes.byteLength)) throw new MediaRejectedError("size");

    const sha256Hex = createHash("sha256").update(bytes).digest("hex");
    const expected = meta.sha256 ?? ref.sha256;
    if (expected && !checksumMatches(expected, bytes, sha256Hex)) throw new MediaRejectedError("checksum");

    return { bytes, mimeType, sizeBytes: bytes.byteLength, sha256Hex };
  }
}

/** WhatsApp reports SHA-256 as hex or base64 depending on the endpoint; accept either. */
function checksumMatches(expected: string, bytes: Uint8Array, hex: string) {
  if (/^[0-9a-f]{64}$/i.test(expected)) return expected.toLowerCase() === hex;
  return createHash("sha256").update(bytes).digest("base64") === expected;
}
