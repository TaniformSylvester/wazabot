import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { fixedMessage, languagePacks } from "@/lib/ai/language/packs";
import { buildPlatformPrompt } from "@/lib/ai/prompts/system-prompt";
import { decideCatalogMatch } from "@/lib/ai/tools/catalog";
import { buildCustomerTurn, textForLanguage } from "@/lib/messaging/ai-input";
import { MVP_CAPABILITIES } from "@/lib/messaging/capabilities";
import { isAllowedMedia, mediaStoragePath } from "@/lib/messaging/media-policy";
import { planInbound } from "@/lib/messaging/plan";
import { MediaRejectedError, NotConfiguredError, type CatalogMatch } from "@/lib/messaging/ports";
import { WhatsAppMediaDownloader } from "@/lib/messaging/whatsapp/media-downloader";
import { parseWebhookMessages, verifyWebhookSignature } from "@/lib/messaging/whatsapp/webhook";
import { locationFromPayload, mapsUrl } from "@/lib/messaging/views";

const wrap = (messages: unknown[], contacts: unknown[] = [{ wa_id: "237670000001", profile: { name: "Awa" } }]) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, contacts, messages } }] }],
});
const base = { from: "237670000001", timestamp: "1790700000" };

describe("WhatsApp webhook parsing", () => {
  it("parses every message type", () => {
    const parsed = parseWebhookMessages(
      wrap([
        { ...base, id: "w1", type: "text", text: { body: "Bonjour" } },
        { ...base, id: "w2", type: "audio", audio: { id: "m2", mime_type: "audio/ogg; codecs=opus", sha256: "abc=", voice: true } },
        { ...base, id: "w3", type: "image", image: { id: "m3", mime_type: "image/jpeg", caption: "C'est combien ?" } },
        { ...base, id: "w4", type: "document", document: { id: "m4", mime_type: "application/pdf", filename: "devis.pdf" } },
        { ...base, id: "w5", type: "video", video: { id: "m5", mime_type: "video/mp4" } },
        { ...base, id: "w6", type: "location", location: { latitude: 4.05, longitude: 9.7, name: "Akwa" } },
        { ...base, id: "w7", type: "sticker", sticker: { id: "m7", mime_type: "image/webp" } },
      ]),
    );
    expect(parsed.map((m) => m.type)).toEqual(["text", "audio", "image", "document", "video", "location", "unsupported"]);
    const [text, audio, image, doc] = parsed;
    expect(text).toMatchObject({ channelMessageId: "w1", from: "237670000001", profileName: "Awa", toPhoneNumberId: "PNID", text: "Bonjour" });
    expect(text.receivedAt.toISOString()).toBe(new Date(1790700000 * 1000).toISOString());
    expect(audio).toMatchObject({ media: { kind: "audio", channelMediaId: "m2", mimeType: "audio/ogg", isVoice: true } });
    expect(image).toMatchObject({ caption: "C'est combien ?", media: { kind: "image", mimeType: "image/jpeg" } });
    expect(doc).toMatchObject({ media: { filename: "devis.pdf" } });
  });

  it("ignores status updates, other objects and malformed entries", () => {
    expect(parseWebhookMessages({ object: "page", entry: [] })).toEqual([]);
    expect(parseWebhookMessages(null)).toEqual([]);
    expect(parseWebhookMessages(wrap([{ id: "x" }, { ...base, id: "y", type: "text", text: {} }]))).toEqual([]);
    const statusOnly = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "P" }, statuses: [{ id: "s" }] } }] }] };
    expect(parseWebhookMessages(statusOnly)).toEqual([]);
  });

  it("marks media without an id as unsupported instead of crashing", () => {
    expect(parseWebhookMessages(wrap([{ ...base, id: "z", type: "image", image: {} }]))[0].type).toBe("unsupported");
  });

  it("verifies the X-Hub-Signature-256 header", () => {
    const body = JSON.stringify(wrap([]));
    const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "secret")).toBe(true);
    expect(verifyWebhookSignature(body, sig, "other")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyWebhookSignature(body, null, "secret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", "secret")).toBe(false);
  });
});

describe("processing plan (MVP capabilities)", () => {
  const [text, audio, image, doc, , location, sticker] = parseWebhookMessages(
    wrap([
      { ...base, id: "a", type: "text", text: { body: "Hi" } },
      { ...base, id: "b", type: "audio", audio: { id: "m", mime_type: "audio/ogg", voice: true } },
      { ...base, id: "c", type: "image", image: { id: "m", mime_type: "image/jpeg" } },
      { ...base, id: "d", type: "document", document: { id: "m", mime_type: "application/pdf" } },
      { ...base, id: "e", type: "video", video: { id: "m", mime_type: "video/mp4" } },
      { ...base, id: "f", type: "location", location: { latitude: 1, longitude: 2 } },
      { ...base, id: "g", type: "reaction", reaction: { emoji: "👍" } },
    ]),
  );

  it("sends text to the AI", () => {
    expect(planInbound(text, MVP_CAPABILITIES)).toMatchObject({ steps: ["ai_reply"], fixedReply: null, finalStatus: "processed" });
  });

  it("stores voice notes and images, replies with a fixed message and notifies the team", () => {
    expect(planInbound(audio, MVP_CAPABILITIES)).toMatchObject({ messageType: "audio", steps: ["store_media"], fixedReply: "audioNotSupported", notifyTeam: true });
    expect(planInbound(image, MVP_CAPABILITIES)).toMatchObject({ messageType: "image", steps: ["store_media"], fixedReply: "imageNotSupported", notifyTeam: true });
    expect(planInbound(doc, MVP_CAPABILITIES)).toMatchObject({ fixedReply: "attachmentReceived", notifyTeam: true });
    expect(planInbound(location, MVP_CAPABILITIES)).toMatchObject({ messageType: "location", steps: [], notifyTeam: true });
    expect(planInbound(sticker, MVP_CAPABILITIES)).toMatchObject({ messageType: null, steps: [], fixedReply: null, notifyTeam: false });
  });

  it("uses the full pipeline once audio and images are switched on", () => {
    const on = { ...MVP_CAPABILITIES, audio: true, image: true };
    expect(planInbound(audio, on).steps).toEqual(["store_media", "transcribe", "ai_reply"]);
    expect(planInbound(image, on).steps).toEqual(["store_media", "ai_vision_reply"]);
  });

  it("has every fixed media reply in every language", () => {
    for (const code of Object.keys(languagePacks) as (keyof typeof languagePacks)[]) {
      for (const key of ["audioNotSupported", "imageNotSupported", "attachmentReceived"] as const) {
        expect(fixedMessage(code, key, "MJ Fashion").length).toBeGreaterThan(10);
      }
    }
  });
});

describe("media policy", () => {
  it("allows known types within WhatsApp's size limits only", () => {
    expect(isAllowedMedia("image", "image/jpeg", 1_000)).toBe(true);
    expect(isAllowedMedia("image", "image/gif")).toBe(false);
    expect(isAllowedMedia("image", "image/png", 6 * 1024 * 1024)).toBe(false);
    expect(isAllowedMedia("audio", "audio/ogg", 2_000_000)).toBe(true);
    expect(isAllowedMedia("document", "application/x-msdownload")).toBe(false);
  });

  it("builds storage paths from our ids only", () => {
    const b = "11111111-1111-4111-8111-111111111111", m = "22222222-2222-4222-8222-222222222222", f = "33333333-3333-4333-8333-333333333333";
    expect(mediaStoragePath(b, m, f, "audio/ogg")).toBe(`${b}/${m}/${f}.ogg`);
    expect(() => mediaStoragePath("../../etc", m, f, "audio/ogg")).toThrow();
  });
});

describe("AI input", () => {
  it("labels voice-note transcripts and analyses their language", () => {
    const msg = { type: "audio" as const, transcript: "Abeg how much for dis shoe?" };
    expect(buildCustomerTurn(msg)[0]).toMatchObject({ type: "text" });
    expect((buildCustomerTurn(msg)[0] as { text: string }).text).toContain("<voice_note_transcript");
    expect(textForLanguage(msg)).toBe("Abeg how much for dis shoe?");
  });

  it("sends images as an image block plus the caption", () => {
    const blocks = buildCustomerTurn({ type: "image", image: { mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }, caption: "C'est combien ?" });
    expect(blocks[0]).toEqual({ type: "image", mediaType: "image/png", base64: "AQID" });
    expect(blocks[1]).toMatchObject({ type: "text" });
    expect(() => buildCustomerTurn({ type: "image", image: { mimeType: "image/gif", bytes: new Uint8Array() } })).toThrow();
  });

  it("tells the model never to price from appearance alone", () => {
    const prompt = buildPlatformPrompt();
    expect(prompt).toContain("searchProducts");
    expect(prompt).toContain("Never give a price, stock level or product detail based only on how an image looks");
  });
});

describe("catalog match guard", () => {
  const m = (id: string, confidence: number): CatalogMatch => ({ productId: id, name: id, confidence, price: 15000, currency: "XAF", inStock: true });
  it("answers only from one clear, confident match", () => {
    expect(decideCatalogMatch([m("a", 0.93), m("b", 0.4)])).toMatchObject({ kind: "confident", match: { productId: "a" } });
    expect(decideCatalogMatch([m("a", 0.95), m("b", 0.78)])).toMatchObject({ kind: "confident" });
    expect(decideCatalogMatch([m("a", 0.86), m("b", 0.84)])).toMatchObject({ kind: "ambiguous" });
    expect(decideCatalogMatch([m("a", 0.6)])).toMatchObject({ kind: "ambiguous" });
    expect(decideCatalogMatch([m("a", 0.3)])).toEqual({ kind: "none" });
    expect(decideCatalogMatch([])).toEqual({ kind: "none" });
  });
});

describe("WhatsApp media download", () => {
  const ref = { kind: "audio" as const, channelMediaId: "MEDIA1", mimeType: "audio/ogg" };
  const bytes = new Uint8Array([7, 7, 7]);
  const hex = createHash("sha256").update(bytes).digest("hex");
  const fakeFetch = (meta: object, body = bytes) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
      if (url.startsWith("https://graph.facebook.com/")) return new Response(JSON.stringify(meta), { status: 200 });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

  it("downloads with the server token and verifies the checksum", async () => {
    const d = new WhatsAppMediaDownloader("TOKEN", "v21.0", fakeFetch({ url: "https://lookaside.fbsbx.com/x", mime_type: "audio/ogg", sha256: hex, file_size: 3 }));
    await expect(d.download(ref)).resolves.toMatchObject({ mimeType: "audio/ogg", sizeBytes: 3, sha256Hex: hex });
  });

  it("rejects bad checksums, disallowed types and oversize files", async () => {
    await expect(new WhatsAppMediaDownloader("TOKEN", "v21.0", fakeFetch({ url: "https://x/y", mime_type: "audio/ogg", sha256: "0".repeat(64) })).download(ref)).rejects.toBeInstanceOf(MediaRejectedError);
    await expect(new WhatsAppMediaDownloader("TOKEN", "v21.0", fakeFetch({ url: "https://x/y", mime_type: "application/x-sh" })).download(ref)).rejects.toMatchObject({ reason: "type" });
    await expect(new WhatsAppMediaDownloader("TOKEN", "v21.0", fakeFetch({ url: "https://x/y", mime_type: "audio/ogg", file_size: 99_000_000 })).download(ref)).rejects.toMatchObject({ reason: "size" });
  });

  it("refuses to run without a token", async () => {
    await expect(new WhatsAppMediaDownloader("", "v21.0").download(ref)).rejects.toBeInstanceOf(NotConfiguredError);
  });
});

describe("location display", () => {
  it("reads stored payloads defensively", () => {
    expect(locationFromPayload({ latitude: 4.05, longitude: 9.7 })).toEqual({ latitude: 4.05, longitude: 9.7, name: undefined, address: undefined });
    expect(locationFromPayload({ latitude: "x" })).toBeNull();
    expect(mapsUrl({ latitude: 4.05, longitude: 9.7 })).toContain("query=4.050000,9.700000");
  });
});
