import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { computeTotals, roundMoney } from "@/lib/documents/calc";
import { formatDocDate, formatDocMoney } from "@/lib/documents/labels";
import { pdfFileName, renderDocumentPdf } from "@/lib/documents/pdf/render";
import { documentSchema, GUEST_MAX_ITEMS } from "@/lib/documents/schema";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPES, type DocumentData } from "@/lib/documents/types";

const base: DocumentData = {
  type: "invoice",
  template: "modern",
  language: "fr",
  currency: "XAF",
  number: "INV-2026-000001",
  issueDate: "2026-10-22",
  dueDate: "2026-11-05",
  business: { name: "Awa Styles", address: "Rue Joss, Akwa, Douala", phone: "+237 699 00 00 01", email: "awa@example.com" },
  customer: { name: "Brenda Nkeng", reference: "CUS-000012", phone: "+237 670 00 00 02" },
  items: [
    { description: "Robe wax", quantity: 2, unitPrice: 15000 },
    { description: "Sac en raphia", quantity: 1, unitPrice: 8000, discountPercent: 10 },
  ],
  discount: 1000,
  taxRate: 19.25,
  notes: "Livraison incluse à Akwa.",
  terms: "Paiement sous 14 jours.",
};

/** Count pages in a PDF buffer. */
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

describe("document totals", () => {
  it("lines, line discount, document discount, tax, total (FCFA, no decimals)", () => {
    const t = computeTotals(base);
    expect(t.lines.map((l) => l.total)).toEqual([30000, 7200]);
    expect(t.subtotal).toBe(37200);
    expect(t.discount).toBe(1000);
    expect(t.taxable).toBe(36200);
    // 36,200 × 19.25 % = 6,968.5 → 6,969 (half away from zero)
    expect(t.tax).toBe(6969);
    expect(t.total).toBe(43169);
    expect(t.paid).toBeNull();
  });

  it("rounds per line in the currency's precision (EUR, 2 decimals)", () => {
    const t = computeTotals({ ...base, currency: "EUR", discount: 0, taxRate: 0, items: [{ description: "x", quantity: 3, unitPrice: 0.335 }] });
    // 0.335 → 34 cents (half up), × 3 = 1.02
    expect(t.total).toBe(1.02);
    expect(roundMoney(1.005, "EUR")).toBe(1.01);
    expect(roundMoney(2.5, "XAF")).toBe(3);
  });

  it("fractional quantities", () => {
    const t = computeTotals({ ...base, discount: 0, taxRate: 0, items: [{ description: "Tissu (m)", quantity: 2.5, unitPrice: 1999 }] });
    expect(t.total).toBe(4998); // 4,997.5 → 4,998
  });

  it("a discount larger than the subtotal stops at zero", () => {
    const t = computeTotals({ ...base, discount: 1_000_000, taxRate: 0 });
    expect(t.total).toBe(0);
    expect(t.discount).toBe(t.subtotal);
  });

  it("receipts: amount received and balance", () => {
    const full = computeTotals({ ...base, type: "receipt", payment: { method: "mtn_momo", amountPaid: 43169 } });
    expect([full.paid, full.balance]).toEqual([43169, 0]);
    const part = computeTotals({ ...base, type: "receipt", payment: { method: "cash", amountPaid: 20000 } });
    expect([part.paid, part.balance]).toEqual([20000, 23169]);
  });

  it("money and dates are written the local way", () => {
    expect(formatDocMoney(43169, "XAF", "fr")).toBe("43 169 FCFA");
    expect(formatDocMoney(43169, "XAF", "en")).toBe("43,169 FCFA");
    expect(formatDocMoney(1250.5, "EUR", "en")).toBe("1,250.50 EUR");
    expect(formatDocDate("2026-10-22", "en")).toBe("22 Oct 2026");
    expect(formatDocDate("2026-10-22", "fr")).toMatch(/^22 oct\.? 2026$/);
  });
});

describe("document validation", () => {
  const schema = documentSchema(GUEST_MAX_ITEMS);
  it("accepts a complete document and trims text", () => {
    const r = schema.safeParse({ ...base, customer: { name: "  Brenda  " } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customer.name).toBe("Brenda");
  });
  it("refuses empty items, bad quantities, due date before issue, receipts without payment", () => {
    expect(schema.safeParse({ ...base, items: [] }).error?.issues[0].message).toBe("min_one_item");
    expect(schema.safeParse({ ...base, items: [{ description: "x", quantity: 0, unitPrice: 1 }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, items: [{ description: "x", quantity: 1.0001, unitPrice: 1 }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, dueDate: "2026-10-01" }).error?.issues[0].message).toBe("due_before_issue");
    expect(schema.safeParse({ ...base, type: "receipt", payment: null }).success).toBe(false);
    expect(schema.safeParse({ ...base, items: Array.from({ length: GUEST_MAX_ITEMS + 1 }, () => base.items[0]) }).error?.issues[0].message).toBe("too_many_items");
  });
});

describe("PDF rendering", () => {
  const out = process.env.DOCS_PDF_OUT;
  if (out) mkdirSync(out, { recursive: true });

  for (const template of DOCUMENT_TEMPLATES) {
    for (const type of DOCUMENT_TYPES) {
      it(`${template} ${type} renders on one A4 page`, async () => {
        const doc: DocumentData = { ...base, template, type, payment: type === "receipt" ? { method: "orange_money", reference: "OM-458812", amountPaid: 43169 } : null };
        const pdf = await renderDocumentPdf(doc);
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pages(pdf)).toBe(1);
        if (out) writeFileSync(`${out}/${template}-${type}.pdf`, pdf);
      }, 20000);
    }
  }

  it("long lists flow over several pages; long names and descriptions don't break the layout", async () => {
    const items = Array.from({ length: 70 }, (_, i) => ({
      description: i === 3 ? "Ensemble complet en tissu wax imprimé haute qualité avec broderies faites main, doublure en coton et finitions dorées sur mesure" : `Article ${i + 1}`,
      details: i === 5 ? "Référence fournisseur TRES-LONGUE-REFERENCE-SANS-ESPACES-0123456789-ABCDEFGHIJKLMNOP" : null,
      quantity: (i % 4) + 1,
      unitPrice: 2500 + i * 100,
    }));
    for (const template of DOCUMENT_TEMPLATES) {
      const doc: DocumentData = { ...base, template, items, customer: { name: "Établissements Commerciaux Généraux du Littoral et du Grand Nord Cameroun SARL" } };
      const pdf = await renderDocumentPdf(doc);
      expect(pages(pdf)).toBeGreaterThanOrEqual(3);
      if (out) writeFileSync(`${out}/${template}-long.pdf`, pdf);
    }
  }, 60000);

  it("draft and voided stamps, English labels", async () => {
    const pdf = await renderDocumentPdf({ ...base, language: "en", number: null, stamp: "draft" });
    expect(pages(pdf)).toBe(1);
    if (out) writeFileSync(`${out}/draft-en.pdf`, pdf);
    if (out) writeFileSync(`${out}/voided-classic.pdf`, await renderDocumentPdf({ ...base, template: "classic", stamp: "voided" }));
  }, 20000);

  it("file names are safe", () => {
    expect(pdfFileName({ type: "receipt", language: "fr", number: "REC-2026-000004" })).toBe("recu-REC-2026-000004.pdf");
    expect(pdfFileName({ type: "invoice", language: "en", number: null })).toBe("invoice.pdf");
    expect(pdfFileName({ type: "quotation", language: "fr", number: '../"x' })).toBe("devis-x.pdf");
  });
});
