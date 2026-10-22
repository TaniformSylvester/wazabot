import "server-only";

import type { CurrentBusiness } from "@/lib/auth/dal";
import { DOCUMENT_LABELS } from "@/lib/documents/labels";
import { buildStatement, type StatementData, type StatementEntry } from "@/lib/documents/statement";
import { DOCUMENT_CURRENCIES, type DocumentCurrency, type DocumentLanguage, type DocumentTemplate } from "@/lib/documents/types";
import { createClient } from "@/lib/supabase/server";

import { businessSnapshot, documentLanguage, getDocumentSettings } from "./documents";
import { localToday } from "./queries";

/*
 * A customer's statement of account (user's session: RLS keeps it to the
 * business). What counts:
 *   billed  orders that aren't cancelled or returned (an order with an invoice
 *           shows the invoice number), and issued invoices without an order;
 *   paid    recorded, not voided payments on those orders and invoices.
 * Voided invoices and payments, quotations and receipts (a receipt repeats a
 * payment already listed) are left out.
 */

const LIMIT = 5000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type StatementOptions = { from?: string | null; to?: string | null; language?: string | null; template?: DocumentTemplate | null };

export async function customerStatement(business: CurrentBusiness, customerId: string, opts: StatementOptions = {}): Promise<StatementData | null> {
  const db = await createClient();
  const { data: customer } = await db
    .from("customers")
    .select("id, reference, name, whatsapp_phone, email, city, preferred_language")
    .eq("business_id", business.id)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return null;

  const settings = await getDocumentSettings(business.id);
  const language: DocumentLanguage = documentLanguage(settings, business, opts.language ?? customer.preferred_language);
  const L = DOCUMENT_LABELS[language];
  const today = localToday(business.timezone);
  const to = isDate(opts.to) && opts.to <= today ? opts.to : today;
  const from = isDate(opts.from) && opts.from <= to ? opts.from : null;
  const day = (iso: string) => localToday(business.timezone, new Date(iso));

  const [{ data: orders }, { data: invoices }] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, created_at, total")
      .eq("business_id", business.id)
      .eq("customer_id", customerId)
      .not("status", "in", "(cancelled,returned)")
      .order("created_at")
      .limit(LIMIT),
    db
      .from("documents")
      .select("id, number, issue_date, issued_at, total, order_id")
      .eq("business_id", business.id)
      .eq("customer_id", customerId)
      .eq("doc_type", "invoice")
      .in("status", ["issued", "partially_paid", "paid"])
      .limit(LIMIT),
  ]);
  const orderIds = (orders ?? []).map((o) => o.id);
  const invoiceByOrder = new Map((invoices ?? []).filter((i) => i.order_id).map((i) => [i.order_id!, i.number!]));
  const standalone = (invoices ?? []).filter((i) => !i.order_id);

  const [orderPayments, invoicePayments] = await Promise.all([
    chunked(orderIds, async (ids) => {
      const { data } = await db
        .from("order_payments")
        .select("id, order_id, amount, method, reference, received_at, created_at")
        .eq("business_id", business.id)
        .eq("kind", "payment")
        .is("voided_at", null)
        .in("order_id", ids);
      return data ?? [];
    }),
    chunked(
      standalone.map((i) => i.id),
      async (ids) => {
        const { data } = await db
          .from("invoice_payments")
          .select("id, document_id, amount, method, reference, received_at, created_at")
          .eq("business_id", business.id)
          .is("voided_at", null)
          .in("document_id", ids);
        return data ?? [];
      },
    ),
  ]);

  const orderRef = new Map((orders ?? []).map((o) => [o.id, invoiceByOrder.get(o.id) ? `${invoiceByOrder.get(o.id)}` : o.order_number]));
  const invoiceRef = new Map(standalone.map((i) => [i.id, i.number ?? ""]));
  const method = (m: string) => L.methods[m as keyof typeof L.methods] ?? m;
  const paymentText = (m: string, ref: string | null) => [L.statement.paymentFor, method(m), ref].filter(Boolean).join(" · ");

  const entries: StatementEntry[] = [
    ...(orders ?? []).map((o) => ({
      date: day(o.created_at),
      sortKey: `${o.created_at}|${o.order_number}`,
      kind: "order" as const,
      reference: orderRef.get(o.id)!,
      description: invoiceByOrder.has(o.id) ? `${L.statement.invoice} · ${L.statement.order} ${o.order_number}` : L.statement.order,
      charge: Number(o.total),
      payment: 0,
    })),
    ...standalone.map((i) => ({
      date: i.issue_date,
      sortKey: `${i.issued_at ?? ""}|${i.number}`,
      kind: "invoice" as const,
      reference: i.number ?? "",
      description: L.statement.invoice,
      charge: Number(i.total),
      payment: 0,
    })),
    ...orderPayments.map((p) => ({
      date: day(p.received_at),
      sortKey: `${p.received_at}|${p.created_at}|${p.id}`,
      kind: "payment" as const,
      reference: orderRef.get(p.order_id) ?? "",
      description: paymentText(p.method, p.reference),
      charge: 0,
      payment: Number(p.amount),
    })),
    ...invoicePayments.map((p) => ({
      date: day(p.received_at),
      sortKey: `${p.received_at}|${p.created_at}|${p.id}`,
      kind: "payment" as const,
      reference: invoiceRef.get(p.document_id) ?? "",
      description: paymentText(p.method, p.reference),
      charge: 0,
      payment: Number(p.amount),
    })),
  ];

  const currency = ((DOCUMENT_CURRENCIES as readonly string[]).includes(business.currency) ? business.currency : "XAF") as DocumentCurrency;
  return buildStatement(entries, {
    language,
    currency,
    template: opts.template ?? settings.default_template,
    business: businessSnapshot(business, settings),
    customer: {
      name: customer.name || `+${customer.whatsapp_phone}`,
      reference: customer.reference,
      address: customer.city,
      phone: customer.whatsapp_phone ? `+${customer.whatsapp_phone}` : null,
      email: customer.email,
    },
    from,
    to,
    issuedOn: today,
  });
}

/** `.in()` lists go in the URL: query in chunks so a long history never makes it too long. */
async function chunked<T>(ids: string[], run: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await run(ids.slice(i, i + 150))));
  return out;
}
