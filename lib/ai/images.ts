import "server-only";

import sharp from "sharp";

import { MEDIA_BUCKET } from "@/lib/messaging/media-policy";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * Customer photos for the assistant (Stage 5). Every image is decoded and
 * re-encoded here before it reaches Claude: at most 1568 px on the long side
 * (Claude's own working size, so nothing useful is lost), JPEG, EXIF
 * stripped. That keeps requests small and refuses anything that isn't really
 * an image.
 */

export type InputImage = { mediaType: "image/jpeg"; data: string };

/** Claude downsizes larger images anyway; sending more only costs time. */
const MAX_EDGE = 1568;
/** Raw upload limit before decoding (WhatsApp allows 5 MB images). */
export const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024;

export class ImageRejectedError extends Error {
  constructor(readonly reason: "too_large" | "not_an_image") {
    super(`image rejected: ${reason}`);
    this.name = "ImageRejectedError";
  }
}

/** Decode → rotate per EXIF → fit within 1568 px → JPEG (base64). */
export async function prepareImage(bytes: Uint8Array): Promise<InputImage> {
  if (bytes.byteLength > MAX_IMAGE_INPUT_BYTES) throw new ImageRejectedError("too_large");
  try {
    const out = await sharp(bytes, { limitInputPixels: 50_000_000, animated: false })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return { mediaType: "image/jpeg", data: out.toString("base64") };
  } catch {
    throw new ImageRejectedError("not_an_image");
  }
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * The photo of an inbound WhatsApp message, once the webhook has stored it
 * (it's downloaded in parallel with the AI reply, so wait a little).
 * Null when it never arrives, failed, or isn't a usable image.
 */
export async function loadMessageImage(admin: Admin, businessId: string, messageId: string, sleep: (ms: number) => Promise<void>, waitMs = 25_000): Promise<InputImage | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const { data } = await admin
      .from("message_media")
      .select("status, storage_path")
      .eq("business_id", businessId)
      .eq("message_id", messageId)
      .eq("kind", "image")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.status === "stored" && data.storage_path) {
      const { data: file, error } = await admin.storage.from(MEDIA_BUCKET).download(data.storage_path);
      if (error || !file) return null;
      try {
        return await prepareImage(new Uint8Array(await file.arrayBuffer()));
      } catch {
        return null;
      }
    }
    if (data?.status === "failed" || Date.now() > deadline) return null;
    await sleep(1000);
  }
}
