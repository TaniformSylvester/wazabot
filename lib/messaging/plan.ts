import type { AiLanguagePack } from "@/lib/ai/language/packs";
import type { Capabilities } from "@/lib/messaging/capabilities";
import type { InboundMessage, MessageType, ProcessingStatus } from "@/lib/messaging/types";

/**
 * Decides what happens to an inbound message, per type and capability.
 * Pure: the webhook handler executes the plan (store → process → reply).
 *
 * Media is always downloaded and stored privately (when storage is set up),
 * even when the AI can't process it yet, so the team can open it in the
 * dashboard.
 */

export type ProcessingStep =
  | "store_media" //       download from WhatsApp → private bucket
  | "transcribe" //        audio → message_transcriptions → detect language
  | "ai_reply" //          text (typed, transcribed or caption) → language pipeline → model
  | "ai_vision_reply"; //  image + caption → vision model with search_catalog tool

export type FixedReplyKey = keyof Pick<AiLanguagePack["messages"], "audioNotSupported" | "imageNotSupported" | "attachmentReceived">;

export type ProcessingPlan = {
  messageType: MessageType | null;
  /** Status to record once the steps finish (or immediately if there are none). */
  finalStatus: ProcessingStatus;
  steps: ProcessingStep[];
  /** Fixed message (in the customer's language) sent instead of an AI reply. */
  fixedReply: FixedReplyKey | null;
  /** Flag the conversation for a person on the team. */
  notifyTeam: boolean;
};

export function planInbound(message: InboundMessage, caps: Capabilities): ProcessingPlan {
  switch (message.type) {
    case "text":
      return { messageType: "text", finalStatus: "processed", steps: ["ai_reply"], fixedReply: null, notifyTeam: false };

    case "audio":
      return caps.audio
        ? { messageType: "audio", finalStatus: "processed", steps: ["store_media", "transcribe", "ai_reply"], fixedReply: null, notifyTeam: false }
        : { messageType: "audio", finalStatus: "unsupported", steps: ["store_media"], fixedReply: "audioNotSupported", notifyTeam: true };

    case "image":
      return caps.image
        ? { messageType: "image", finalStatus: "processed", steps: ["store_media", "ai_vision_reply"], fixedReply: null, notifyTeam: false }
        : { messageType: "image", finalStatus: "unsupported", steps: ["store_media"], fixedReply: "imageNotSupported", notifyTeam: true };

    case "document":
    case "video":
      return { messageType: message.type, finalStatus: "unsupported", steps: ["store_media"], fixedReply: "attachmentReceived", notifyTeam: true };

    case "location":
      return { messageType: "location", finalStatus: "unsupported", steps: [], fixedReply: "attachmentReceived", notifyTeam: true };

    case "unsupported":
      // Stickers, reactions, contacts…: nothing to answer.
      return { messageType: null, finalStatus: "unsupported", steps: [], fixedReply: null, notifyTeam: false };
  }
}
