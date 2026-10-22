import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { computeTotals } from "@/lib/documents/calc";
import { DOCUMENT_LABELS } from "@/lib/documents/labels";
import { metaRows, paidInFull, paidRows, relatedRows, stampWord } from "@/lib/documents/layout";
import { renderDocumentPdf, renderStatementPdf, statementFileName } from "@/lib/documents/pdf/render";
import { buildStatement, type StatementEntry } from "@/lib/documents/statement";
import { DOCUMENT_TEMPLATES, type DocumentData } from "@/lib/documents/types";

const invoice: DocumentData = {
  type: "invoice",
  template: "modern",
  language: "fr",
  currency: "XAF",
  number: "INV-2026-000004",
  issueDate: "2026-10-22",
  dueDate: "2026-11-05",
  business: { name: "Awa Styles", phone: "+237 699 00 00 01" },
  customer: { name: "Brenda Nkeng", reference: "CUS-000012" },
  items: [
    { description: "Robe wax", details: "Rouge / M", quantity: 2, unitPrice: 15000 },
    { description: "Livraison", quantity: 1, unitPrice: 2000 },
  ],
  discount: 1000,
  related: { kind: "order", number: "ORD-00067" },
};
const money = (n: number) => `${n}`;
const L = DOCUMENT_LABELS.fr;
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
const out = "test-results/documents";

describe("invoices with payments", () => {
  it("nothing paid: no paid / balance rows", () => {
    const t = computeTotals(invoice);
    expect(t.total).toBe(31000);
    expect(t.paid).toBeNull();
    expect(paidRows(invoice, t, L, money)).toEqual([]);
  });

  it("partly paid: Payé and Reste à payer", () => {
    const doc = { ...invoice, invoicePaid: 10000 };
    const t = computeTotals(doc);
    expect([t.paid, t.balance]).toEqual([10000, 21000]);
    expect(paidRows(doc, t, L, money)).toEqual([
      ["Payé", "10000"],
      ["Reste à payer", "21000"],
    ]);
  });

  it("an order's invoice names the order; a paid invoice is stamped Payé", () => {
    expect(metaRows(invoice, L).at(-1)).toEqual(["Commande", "ORD-00067"]);
    expect(stampWord({ ...invoice, stamp: "paid" }, L)).toBe("Payé");
    expect(stampWord({ ...invoice, stamp: null }, L)).toBeNull();
  });
});

describe("receipts for a recorded payment", () => {
  const receipt: DocumentData = {
    ...invoice,
    type: "receipt",
    number: "REC-2026-000009",
    dueDate: null,
    items: [{ description: "Paiement — facture INV-2026-000004", quantity: 1, unitPrice: 10000 }],
    discount: 0,
    payment: { method: "mtn_momo", reference: "MP2401", amountPaid: 10000 },
    related: { kind: "invoice", number: "INV-2026-000004", total: 31000, paidToDate: 10000, balance: 21000 },
  };

  it("prints the invoice, its total, paid to date and the balance left on it", () => {
    const t = computeTotals(receipt);
    expect(metaRows(receipt, L).at(-1)).toEqual(["Pour la facture", "INV-2026-000004"]);
    expect(relatedRows(receipt, L, money)).toEqual([
      ["Total de la facture", "31000"],
      ["Payé à ce jour", "10000"],
    ]);
    expect(paidRows(receipt, t, L, money)).toEqual([
      ["Montant reçu", "10000"],
      ["Reste à payer", "21000"],
    ]);
    expect(paidInFull(receipt, t)).toBe(false);
  });

  it("the last payment says Paid in full; a standalone receipt is judged on itself", () => {
    const last = { ...receipt, related: { ...receipt.related!, paidToDate: 31000, balance: 0 } };
    expect(paidInFull(last, computeTotals(last))).toBe(true);
    const standalone = { ...receipt, related: null };
    expect(paidInFull(standalone, computeTotals(standalone))).toBe(true);
    expect(relatedRows(standalone, L, money)).toEqual([]);
  });

  it("renders in every template (one page)", async () => {
    mkdirSync(out, { recursive: true });
    for (const template of DOCUMENT_TEMPLATES) {
      const pdf = await renderDocumentPdf({ ...receipt, template, language: template === "classic" ? "en" : "fr" });
      expect(pages(pdf)).toBe(1);
      writeFileSync(`${out}/payment-receipt-${template}.pdf`, pdf);
      const inv = await renderDocumentPdf({ ...invoice, template, invoicePaid: 31000, stamp: "paid" });
      expect(pages(inv)).toBe(1);
      writeFileSync(`${out}/paid-invoice-${template}.pdf`, inv);
    }
  });
});

describe("statement of account", () => {
  const entries: StatementEntry[] = [
    { date: "2026-09-02", sortKey: "a", kind: "order", reference: "ORD-00010", description: "Commande", charge: 20000, payment: 0 },
    { date: "2026-09-02", sortKey: "b", kind: "payment", reference: "ORD-00010", description: "Espèces", charge: 0, payment: 5000 },
    { date: "2026-10-01", sortKey: "c", kind: "invoice", reference: "INV-2026-000001", description: "Facture", charge: 50000, payment: 0 },
    // Same day: the payment comes after the charge even with an earlier key.
    { date: "2026-10-05", sortKey: "a", kind: "payment", reference: "INV-2026-000001", description: "MTN", charge: 0, payment: 20000 },
    { date: "2026-10-05", sortKey: "z", kind: "order", reference: "ORD-00011", description: "Commande", charge: 7500, payment: 0 },
    { date: "2026-11-01", sortKey: "a", kind: "payment", reference: "ORD-00011", description: "Après la période", charge: 0, payment: 7500 },
  ];
  const p = {
    language: "fr" as const,
    currency: "XAF" as const,
    template: "modern" as const,
    business: { name: "Awa Styles" },
    customer: { name: "Brenda Nkeng", reference: "CUS-000012" },
    issuedOn: "2026-10-31",
  };

  it("all time: running balance, totals, closing balance; later entries left out", () => {
    const st = buildStatement(entries, { ...p, from: null, to: "2026-10-31" });
    expect(st.lines.map((l) => [l.reference, l.balance])).toEqual([
      ["ORD-00010", 20000],
      ["ORD-00010", 15000],
      ["INV-2026-000001", 65000],
      ["ORD-00011", 72500],
      ["INV-2026-000001", 52500],
    ]);
    expect([st.opening, st.totalCharges, st.totalPayments, st.closing]).toEqual([0, 77500, 25000, 52500]);
  });

  it("a period: what came before is one opening balance", () => {
    const st = buildStatement(entries, { ...p, from: "2026-10-01", to: "2026-10-31" });
    expect(st.opening).toBe(15000);
    expect(st.lines).toHaveLength(3);
    expect([st.totalCharges, st.totalPayments, st.closing]).toEqual([57500, 20000, 52500]);
  });

  it("2-decimal currencies add up exactly", () => {
    const st = buildStatement(
      [
        { date: "2026-10-01", sortKey: "a", kind: "invoice", reference: "INV-1", description: "", charge: 0.1, payment: 0 },
        { date: "2026-10-02", sortKey: "a", kind: "invoice", reference: "INV-2", description: "", charge: 0.2, payment: 0 },
      ],
      { ...p, currency: "EUR", from: null, to: "2026-10-31" },
    );
    expect(st.closing).toBe(0.3);
  });

  it("renders (and runs over several pages with many lines); safe file name", async () => {
    mkdirSync(out, { recursive: true });
    const many: StatementEntry[] = Array.from({ length: 90 }, (_, i) => ({
      date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      sortKey: String(i).padStart(3, "0"),
      kind: i % 3 === 2 ? "payment" : "order",
      reference: `ORD-${String(100 + i).padStart(5, "0")}`,
      description: i % 3 === 2 ? "Paiement MTN Mobile Money" : "Commande WhatsApp",
      charge: i % 3 === 2 ? 0 : 12500,
      payment: i % 3 === 2 ? 10000 : 0,
    }));
    for (const template of DOCUMENT_TEMPLATES) {
      const pdf = await renderStatementPdf(buildStatement(many, { ...p, template, from: "2026-10-01", to: "2026-10-31" }));
      expect(pages(pdf)).toBeGreaterThan(1);
      writeFileSync(`${out}/statement-${template}.pdf`, pdf);
    }
    const empty = await renderStatementPdf(buildStatement([], { ...p, from: null, to: "2026-10-31" }));
    expect(pages(empty)).toBe(1);
    expect(statementFileName({ language: "fr", to: "2026-10-31", customer: { name: "B", reference: "CUS-000012" } })).toBe("releve-CUS-000012-2026-10-31.pdf");
    expect(statementFileName({ language: "en", to: "2026-10-31", customer: { name: "B", reference: "../x" } })).toBe("statement-x-2026-10-31.pdf");
  });
});

/** The text-layer tables (ToUnicode) of a PDF: one per embedded font. */
function toUnicodeTables(pdf: Buffer): string[] {
  const out: string[] = [];
  for (const m of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const body = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      if (body.includes("begincmap")) out.push(body);
    } catch {
      // not a compressed stream
    }
  }
  return out;
}

describe("PDF text after accented capitals (fontkit glyph cache)", () => {
  it("a French paid / voided stamp (É) doesn't break the letters of the next PDFs", async () => {
    await renderDocumentPdf({ ...invoice, stamp: "voided" });
    await renderDocumentPdf({ ...invoice, template: "minimal", stamp: "paid", invoicePaid: 31000 });
    const next = await renderDocumentPdf({ ...invoice, type: "receipt", number: "REC-2026-000010", related: null, payment: { method: "cash", amountPaid: 31000 } });
    const tables = toUnicodeTables(next);
    expect(tables.length).toBeGreaterThan(1);
    // With the bug, "RE" came out as one glyph with no text ("<>"), printed "EC-2026-000010".
    for (const t of tables) expect(t).not.toContain("<>");
  });
});
