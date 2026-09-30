/**
 * Turns a processed inbound message into the customer turn sent to the model.
 * Provider-neutral blocks; the Claude call (WhatsApp phase) maps them to
 * Messages API content blocks (text → text, image → base64 image source).
 *
 * Every message reaches the model as text it can read plus, for images, the
 * image itself — so the same language pipeline and prompt serve all types.
 */

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type ProcessedInbound =
  | { type: "text"; text: string }
  | { type: "audio"; transcript: string }
  | { type: "image"; image: { mimeType: string; bytes: Uint8Array }; caption?: string };

const VISION_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type VisionType = (typeof VISION_TYPES)[number];

/** The text the language pipeline (detect/resolve) should analyse for this message. */
export function textForLanguage(message: ProcessedInbound): string {
  switch (message.type) {
    case "text":
      return message.text;
    case "audio":
      return message.transcript;
    case "image":
      return message.caption ?? "";
  }
}

export function buildCustomerTurn(message: ProcessedInbound): AiContentBlock[] {
  switch (message.type) {
    case "text":
      return [{ type: "text", text: message.text }];

    case "audio":
      // Labelled so the model knows words may be mis-heard and can ask instead of guessing.
      return [
        {
          type: "text",
          text: `<voice_note_transcript note="automatic transcription of the customer's voice note; words may be mis-heard">\n${message.transcript}\n</voice_note_transcript>`,
        },
      ];

    case "image": {
      if (!(VISION_TYPES as readonly string[]).includes(message.image.mimeType)) {
        throw new Error("buildCustomerTurn: unsupported image type for vision");
      }
      const blocks: AiContentBlock[] = [
        { type: "image", mediaType: message.image.mimeType as VisionType, base64: Buffer.from(message.image.bytes).toString("base64") },
      ];
      blocks.push({
        type: "text",
        text: message.caption
          ? `<image_caption>\n${message.caption}\n</image_caption>`
          : "<image_caption>(The customer sent this image without a caption.)</image_caption>",
      });
      return blocks;
    }
  }
}
