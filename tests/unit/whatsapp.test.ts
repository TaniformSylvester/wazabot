import { describe, expect, it } from "vitest";

import { parseWebhookStatuses } from "@/lib/messaging/whatsapp/webhook";
import { decryptSecret, encryptSecret, encryptionKey, tokenHint } from "@/lib/whatsapp/crypto";
import { GraphApiError, WhatsAppGraphClient } from "@/lib/whatsapp/graph";
import { windowOpen } from "@/lib/whatsapp/service";

const KEY = Buffer.alloc(32, 7);

describe("token encryption", () => {
  it("round-trips and never contains the token", () => {
    const token = "EAAG-secret-token-1234567890";
    const sealed = encryptSecret(token, KEY);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(token);
    expect(decryptSecret(sealed, KEY)).toBe(token);
    expect(encryptSecret(token, KEY)).not.toBe(sealed); // random IV
    expect(tokenHint(token)).toBe("7890");
  });

  it("rejects tampering and wrong keys", () => {
    const sealed = encryptSecret("abc", KEY);
    const [v, iv, tag, data] = sealed.split(":");
    const flipped = [v, iv, tag, (data[0] === "A" ? "B" : "A") + data.slice(1)].join(":");
    expect(() => decryptSecret(flipped, KEY)).toThrow();
    expect(() => decryptSecret(sealed, Buffer.alloc(32, 8))).toThrow();
  });

  it("accepts 32-byte keys as hex or base64 only", () => {
    expect(encryptionKey("ab".repeat(32)).length).toBe(32);
    expect(encryptionKey(Buffer.alloc(32, 1).toString("base64")).length).toBe(32);
    expect(() => encryptionKey("short")).toThrow();
    expect(() => encryptionKey("")).toThrow();
  });
});

describe("delivery status webhooks", () => {
  it("parses sent/delivered/read/failed and ignores the rest", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PNID" },
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "1790700000", recipient_id: "237670000001" },
                  { id: "wamid.2", status: "failed", timestamp: "1790700001", errors: [{ code: 131047, title: "Re-engagement message" }] },
                  { id: "wamid.3", status: "deleted" },
                ],
              },
            },
          ],
        },
      ],
    };
    const s = parseWebhookStatuses(payload);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ phoneNumberId: "PNID", channelMessageId: "wamid.1", status: "delivered" });
    expect(s[1]).toMatchObject({ status: "failed", error: "131047 Re-engagement message" });
    expect(parseWebhookStatuses({ object: "page" })).toEqual([]);
  });
});

describe("Graph API client", () => {
  const fake = (status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []) =>
    (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

  it("sends a text message with the token only in the Authorization header", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const client = new WhatsAppGraphClient("TOKEN123", { baseUrl: "https://graph.test", version: "v23.0", fetchImpl: fake(200, { messages: [{ id: "wamid.OUT" }] }, seen) });
    await expect(client.sendText("PNID", "237670000001", "Bonjour")).resolves.toEqual({ messageId: "wamid.OUT" });
    expect(seen[0].url).toBe("https://graph.test/v23.0/PNID/messages");
    expect((seen[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN123");
    expect(String(seen[0].init?.body)).not.toContain("TOKEN123");
    expect(JSON.parse(String(seen[0].init?.body))).toMatchObject({ messaging_product: "whatsapp", to: "237670000001", type: "text", text: { body: "Bonjour" } });
  });

  it("maps Graph errors without leaking the token", async () => {
    const client = new WhatsAppGraphClient("TOKEN123", { baseUrl: "https://graph.test", fetchImpl: fake(400, { error: { code: 131047, message: "Re-engagement message" } }) });
    const err = await client.sendText("PNID", "1", "x").catch((e) => e);
    expect(err).toBeInstanceOf(GraphApiError);
    expect(err.isWindowClosed).toBe(true);
    expect(err.summary).toBe("131047 Re-engagement message");
    expect(String(err.message)).not.toContain("TOKEN123");
    const auth = await new WhatsAppGraphClient("T", { baseUrl: "https://graph.test", fetchImpl: fake(401, { error: { code: 190, message: "expired" } }) })
      .getPhoneNumber("1")
      .catch((e) => e);
    expect(auth.isAuthError).toBe(true);
  });
});

describe("24-hour customer-service window", () => {
  it("is open for 24 hours after the customer's last message", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(windowOpen("2026-10-01T12:30:00Z", now)).toBe(true);
    expect(windowOpen("2026-10-01T11:59:00Z", now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
  });
});
