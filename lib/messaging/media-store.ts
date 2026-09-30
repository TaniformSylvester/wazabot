import "server-only";

import { getCurrentBusiness } from "@/lib/auth/dal";
import { MEDIA_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/messaging/media-policy";
import { NotConfiguredError, type DownloadedMedia, type MediaStore } from "@/lib/messaging/ports";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Private media storage on Supabase Storage (bucket `whatsapp-media`, no
 * public access, no browser policies). Only server code with the service
 * role writes or signs; users only ever receive short-lived signed URLs.
 */
export class SupabaseMediaStore implements MediaStore {
  private client() {
    const admin = createAdminClient();
    if (!admin) throw new NotConfiguredError("media_storage");
    return admin;
  }

  async put(path: string, media: DownloadedMedia) {
    const { error } = await this.client()
      .storage.from(MEDIA_BUCKET)
      .upload(path, media.bytes, { contentType: media.mimeType, upsert: false, cacheControl: "private, max-age=0" });
    if (error) throw new Error(`media upload failed: ${error.message}`);
  }

  async signedUrl(path: string, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
    const { data, error } = await this.client().storage.from(MEDIA_BUCKET).createSignedUrl(path, ttlSeconds);
    if (error || !data) throw new Error("could not sign media url");
    return data.signedUrl;
  }

  async remove(path: string) {
    const { error } = await this.client().storage.from(MEDIA_BUCKET).remove([path]);
    if (error) throw new Error(`media delete failed: ${error.message}`);
  }
}

/**
 * Signed URL for a media file, for the signed-in team member viewing a
 * conversation. The row is read with the user's own client, so Row Level
 * Security proves membership before the service role signs anything.
 * Returns null when the media isn't visible to the user or isn't stored.
 */
export async function getSignedMediaUrl(mediaId: string, store: MediaStore = new SupabaseMediaStore()): Promise<string | null> {
  const business = await getCurrentBusiness();
  if (!business) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_media")
    .select("business_id, storage_path, status")
    .eq("id", mediaId)
    .maybeSingle();
  if (!data || data.status !== "stored" || !data.storage_path || data.business_id !== business.id) return null;
  return store.signedUrl(data.storage_path, SIGNED_URL_TTL_SECONDS);
}
