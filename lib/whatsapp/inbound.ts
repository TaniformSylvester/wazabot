import "server-only";

import { detectLanguage } from "@/lib/ai/language";
import { logServerError } from "@/lib/log";
import { MVP_CAPABILITIES } from "@/lib/messaging/capabilities";
import { mediaStoragePath, retentionDeadline } from "@/lib/messaging/media-policy";
import { SupabaseMediaStore } from "@/lib/messaging/media-store";
import { MediaRejectedError, type MediaStore } from "@/lib/messaging/ports";
import { planInbound } from "@/lib/messaging/plan";
import type { InboundMessage, MediaRef } from "@/lib/messaging/types";
import { WhatsAppMediaDownloader } from "@/lib/messaging/whatsapp/media-downloader";
import { parseWebhookMessages, parseWebhookStatuses } from "@/lib/messaging/whatsapp/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/whatsapp/crypto";
import type { AiJob } from "@/lib/ai/pipeline";

/*
 * Webhook → database. Each inbound message is stored in one atomic,
 * idempotent database call (ingest_whatsapp_message); media files are
 * downloaded afterwards (after the 200 response) into private storage.
 *
 * Text messages are stored as processing_status "received"; the AI pipeline
 * (lib/ai/pipeline.ts) answers them after the webhook has responded. Other
 * types follow the processing plan (stored, flagged).
 * Logs contain ids and error codes only — never message content.
 */

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type MediaJob = { businessId: string; messageId: string; media: MediaRef };
export type WebhookResult = { stored: number; duplicates: number; ignored: number; statuses: number; mediaJobs: MediaJob[]; aiJobs: AiJob[] };

/** Reasons recorded when a type isn't processed automatically yet. */
const NOT_PROCESSED_REASON: Record<string, string> = {
  audio: "transcription_not_enabled",
  image: "vision_not_enabled",
  document: "not_processed",
  video: "not_processed",
  location: "not_processed",
};

function contentOf(message: InboundMessage) {
  switch (message.type) {
    case "text":
      return { content: message.text, caption: null, payload: {} };
    case "image":
    case "document":
    case "video":
      return { content: "", caption: message.caption ?? null, payload: {} };
    case "audio":
      return { content: "", caption: null, payload: {} };
    case "location":
      return { content: "", caption: null, payload: message.location };
    case "unsupported":
      return { content: "", caption: null, payload: { channel_type: message.channelType } };
  }
}

export async function handleWebhookPayload(payload: unknown, admin: Admin): Promise<WebhookResult> {
  const result: WebhookResult = { stored: 0, duplicates: 0, ignored: 0, statuses: 0, mediaJobs: [], aiJobs: [] };

  for (const message of parseWebhookMessages(payload)) {
    const plan = planInbound(message, MVP_CAPABILITIES);
    // Stickers, reactions, contacts…: not shown as messages in this stage.
    if (!plan.messageType) {
      result.ignored++;
      continue;
    }
    const { content, caption, payload: extra } = contentOf(message);
    const languageText = content || caption || "";
    const detection = languageText ? detectLanguage(languageText) : null;
    const processingStatus = message.type === "text" ? "received" : plan.finalStatus;

    const { data, error } = await admin.rpc("ingest_whatsapp_message", {
      p_phone_number_id: message.toPhoneNumberId,
      p_whatsapp_message_id: message.channelMessageId,
      p_from: message.from,
      p_profile_name: message.profileName ?? "",
      p_message_type: plan.messageType,
      p_content: content,
      // SQL null (the generated type doesn't model nullable arguments).
      p_caption: caption as string,
      p_payload: extra,
      p_received_at: message.receivedAt.toISOString(),
      p_processing_status: processingStatus,
      p_processing_error: processingStatus === "unsupported" ? NOT_PROCESSED_REASON[message.type] : undefined,
      p_language: detection?.primary ?? undefined,
      p_language_confidence: detection?.primary ? detection.confidence : undefined,
      p_secondary_language: detection?.secondary ?? undefined,
      p_is_mixed: detection?.mixed ?? false,
    });
    if (error) {
      logServerError("whatsapp.ingest", error);
      throw new Error("ingest failed"); // 500 → Meta retries; ingestion is idempotent
    }
    const row = data?.[0];
    if (!row) {
      result.ignored++; // number not connected to any business
      console.warn(`[whatsapp.webhook] message for phone_number_id ${message.toPhoneNumberId} ignored: no connected business`);
      continue;
    }
    if (!row.inserted) {
      result.duplicates++;
      continue;
    }
    result.stored++;
    result.aiJobs.push({ businessId: row.business_id, conversationId: row.conversation_id, messageId: row.message_id });
    if ("media" in message && plan.steps.includes("store_media")) {
      result.mediaJobs.push({ businessId: row.business_id, messageId: row.message_id, media: message.media });
    }
  }

  for (const s of parseWebhookStatuses(payload)) {
    // Delivery failures explain why a customer didn't get a message (code + title only, no content).
    if (s.status === "failed") console.warn(`[whatsapp.webhook] delivery failed for ${s.channelMessageId}: ${s.error ?? "no error details"}`);
    const { data, error } = await admin.rpc("record_whatsapp_status", {
      p_phone_number_id: s.phoneNumberId,
      p_whatsapp_message_id: s.channelMessageId,
      p_status: s.status,
      p_error: s.error,
      p_at: s.at.toISOString(),
    });
    if (error) logServerError("whatsapp.status", error);
    else if (data) result.statuses++;
  }
  return result;
}

/**
 * Downloads one media file with the business's own token and stores it
 * privately. Failures are recorded on the media row; the message stays.
 */
export async function storeMedia(job: MediaJob, admin: Admin, store: MediaStore = new SupabaseMediaStore()) {
  const { data: row, error } = await admin
    .from("message_media")
    .insert({
      business_id: job.businessId,
      message_id: job.messageId,
      kind: job.media.kind,
      whatsapp_media_id: job.media.channelMediaId,
      mime_type: job.media.mimeType,
      is_voice: job.media.isVoice ?? false,
      original_filename: job.media.filename?.slice(0, 255),
    })
    .select("id")
    .single();
  if (error || !row) {
    logServerError("whatsapp.media.row", error);
    return;
  }
  try {
    const { data: cred } = await admin.from("whatsapp_credentials").select("access_token_encrypted").eq("business_id", job.businessId).maybeSingle();
    const token = cred ? decryptSecret(cred.access_token_encrypted) : undefined;
    const media = await new WhatsAppMediaDownloader(token).download(job.media);
    const path = mediaStoragePath(job.businessId, job.messageId, row.id, media.mimeType);
    await store.put(path, media);
    await admin
      .from("message_media")
      .update({
        status: "stored",
        storage_path: path,
        mime_type: media.mimeType,
        size_bytes: media.sizeBytes,
        sha256: media.sha256Hex,
        delete_after: retentionDeadline(new Date()).toISOString(),
      })
      .eq("id", row.id);
  } catch (e) {
    const reason = e instanceof MediaRejectedError ? e.reason : "store";
    logServerError("whatsapp.media", { code: reason, message: e instanceof Error ? e.name : "error" });
    await admin.from("message_media").update({ status: "failed" }).eq("id", row.id);
  }
}
