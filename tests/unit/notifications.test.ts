import { describe, expect, it } from "vitest";

import { SAMPLE_PDF } from "@/lib/notifications/sample-pdf";
import { TEMPLATES, TEMPLATE_KINDS, TEMPLATE_LANGUAGES, bodyParams, renderBody, templateLanguageFor, templateName } from "@/lib/notifications/templates";
import { WhatsAppGraphClient } from "@/lib/whatsapp/graph";
import { parseTemplateStatusUpdates } from "@/lib/whatsapp/inbound";

describe("notification templates", () => {
  it("follow Meta's rules: numbered params in order, not first or last, not side by side", () => {
    for (const kind of TEMPLATE_KINDS) {
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

  it("document template: a PDF header and the document named in the message", () => {
    expect(TEMPLATES.document.header).toBe("DOCUMENT");
    expect(templateName("document")).toBe("wazabolt_document");
    expect(renderBody("document", "en", { customer: "Brenda", document: "invoice INV-2026-000041", business: "Awa Styles" })).toBe(
      "Hello Brenda, here is your invoice INV-2026-000041 from Awa Styles. Reply here if you have any questions.",
    );
    expect(renderBody("document", "fr", { customer: "Marie", document: "bulletin de notes de Ngo Marie (1er trimestre)", business: "Collège La Réussite" })).toBe(
      "Bonjour Marie, voici votre bulletin de notes de Ngo Marie (1er trimestre) de Collège La Réussite. Répondez ici si vous avez des questions.",
    );
  });

  it("the example file for Meta's review is a valid one-page PDF", () => {
    const text = SAMPLE_PDF.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // startxref points at the cross-reference table, and every object offset points at its object.
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("Graph client: a document template is submitted with its example and sent with the PDF", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith("/app?fields=id") ? { id: "app_1" } : url.includes("/uploads?") ? { id: "upload:s1" } : url.endsWith("/upload:s1") ? { h: "H1" } : url.endsWith("/message_templates") ? { id: "t1", status: "PENDING" } : { messages: [{ id: "wamid.1" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new WhatsAppGraphClient("TOKEN", { baseUrl: "https://g", version: "v21.0", fetchImpl });
    expect(await c.uploadExampleFile(SAMPLE_PDF, "application/pdf", "sample-invoice.pdf")).toBe("H1");
    expect(calls[1].url).toContain(`/app_1/uploads?file_name=sample-invoice.pdf&file_length=${SAMPLE_PDF.length}&file_type=application%2Fpdf`);
    expect((calls[2].init.headers as Record<string, string>).Authorization).toBe("OAuth TOKEN");
    await c.createTemplate("waba", { name: "wazabolt_document", language: "en", body: TEMPLATES.document.body.en, example: [...TEMPLATES.document.example], header: { format: "DOCUMENT", exampleHandle: "H1" } });
    const created = JSON.parse(String(calls[3].init.body));
    expect(created.components[0]).toEqual({ type: "HEADER", format: "DOCUMENT", example: { header_handle: ["H1"] } });
    expect(created.components[1].type).toBe("BODY");
    await c.sendTemplate("phone", "237600000000", "wazabolt_document", "fr", ["Marie", "facture INV-1", "Awa Styles"], { mediaId: "m1", fileName: "facture.pdf" });
    const sent = JSON.parse(String(calls[4].init.body));
    expect(sent.template.components[0]).toEqual({ type: "header", parameters: [{ type: "document", document: { id: "m1", filename: "facture.pdf" } }] });
    expect(sent.template.components[1].parameters.map((p: { text: string }) => p.text)).toEqual(["Marie", "facture INV-1", "Awa Styles"]);
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
