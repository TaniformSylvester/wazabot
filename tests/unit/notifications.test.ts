import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS, TEMPLATES, TEMPLATE_LANGUAGES, bodyParams, renderBody, templateLanguageFor, templateName } from "@/lib/notifications/templates";
import { parseTemplateStatusUpdates } from "@/lib/whatsapp/inbound";

describe("notification templates", () => {
  it("follow Meta's rules: numbered params in order, not first or last, not side by side", () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const lang of TEMPLATE_LANGUAGES) {
        const body = TEMPLATES[kind].body[lang];
        const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
        expect(nums).toEqual(TEMPLATES[kind].params.map((_, i) => i + 1));
        expect(TEMPLATES[kind].example).toHaveLength(nums.length);
        expect(body.trim().startsWith("{{")).toBe(false);
        expect(body.trim().endsWith("}}")).toBe(false);
        expect(/\}\}\s*\{\{/.test(body)).toBe(false);
        expect(body.length).toBeLessThanOrEqual(1024);
      }
      expect(templateName(kind)).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("renders the same words as a normal message", () => {
    const text = renderBody("order_ready", "fr", { customer: "Brenda", order: "ORD-00012", business: "Awa Styles" });
    expect(text).toBe("Bonjour Brenda, votre commande ORD-00012 chez Awa Styles est prête.");
  });

  it("never sends a blank parameter", () => {
    expect(bodyParams("follow_up", { customer: " ", business: "Awa Styles" })).toEqual(["-", "Awa Styles"]);
  });

  it("picks French for French-speaking customers, English otherwise", () => {
    expect(templateLanguageFor("fr", "en")).toBe("fr");
    expect(templateLanguageFor("wes", "fr")).toBe("en");
    expect(templateLanguageFor(null, "fr")).toBe("fr");
    expect(templateLanguageFor(undefined, "en")).toBe("en");
  });
});

describe("template status webhook", () => {
  it("reads Meta's review results", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            { field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 12345, message_template_name: "wazabolt_order_ready" } },
            { field: "message_template_status_update", value: { event: "REJECTED", message_template_id: "678", reason: "INVALID_FORMAT" } },
            { field: "messages", value: {} },
          ],
        },
      ],
    };
    expect(parseTemplateStatusUpdates(payload)).toEqual([
      { templateId: "12345", event: "APPROVED", reason: null },
      { templateId: "678", event: "REJECTED", reason: "INVALID_FORMAT" },
    ]);
  });
});
