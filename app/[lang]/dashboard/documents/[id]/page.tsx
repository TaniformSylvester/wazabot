import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Download, Pencil, Printer } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionButton, ActionForm, DeleteButton, SubmitButton, TextField } from "@/components/app/form";
import { PageHeader, Panel, StatusBadge, buttonLink, formatDate, param, secondaryLink } from "@/components/app/ui";
import { DocumentPreview } from "@/components/documents/document-preview";
import { InvoicePaymentsPanel, type InvoicePayment } from "@/components/documents/invoice-payments";
import { documentStatusTone } from "@/components/documents/status";
import { WhatsAppSendPanel } from "@/components/documents/whatsapp-panel";
import { sendDocumentWhatsApp } from "@/lib/actions/document-links";
import { deleteDraft, duplicateDocument, issueDocument, setQuotationStatus, voidDocument } from "@/lib/actions/documents";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { displayStatus, getDocument, listInvoicePayments, receiptsForPayments, rowToDocument, whatsappSendState } from "@/lib/data/documents";
import { listOrderPayments, localToday } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.documents.title);

export default async function DocumentPage({ params, searchParams }: PageProps<"/[lang]/dashboard/documents/[id]">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/documents/${id}`));
  const row = isUuid(id) ? await getDocument(business.id, id) : null;
  if (!row) notFound();
  const d = t.dashboard;
  const doc = d.documents;
  const v = doc.view;
  const data = rowToDocument(row);
  const status = displayStatus(row);
  const isDraft = row.status === "draft";
  const canAct = hasRole(business.role, "agent");
  const isAdmin = hasRole(business.role, "admin");
  const typeLabel = t.docs.types[data.type];
  const pdf = localizePath(locale, `/dashboard/documents/${row.id}/pdf`);
  const linked = Boolean(row.order_id || row.order_payment_id || row.invoice_payment_id);
  const live = !isDraft && row.status !== "voided";
  const supabase = await createClient();

  // Invoices: their payments (an order's invoice: the order's payments) and the receipts made from them.
  let payments: InvoicePayment[] = [];
  let receipts = new Map<string, { id: string; number: string | null }>();
  let order: { id: string; number: string } | null = null;
  if (row.order_id) {
    const { data: o } = await supabase.from("orders").select("id, order_number").eq("business_id", business.id).eq("id", row.order_id).maybeSingle();
    order = o ? { id: o.id, number: o.order_number } : null;
  }
  if (data.type === "invoice") {
    if (row.order_id) {
      const rows = await listOrderPayments(business.id, row.order_id);
      payments = rows.map((x) => ({ ...x, amount: Number(x.amount), source: "order" as const }));
      receipts = await receiptsForPayments(business.id, "order", rows.map((x) => x.id));
    } else {
      const rows = await listInvoicePayments(business.id, row.id);
      payments = rows.map((x) => ({ ...x, amount: Number(x.amount), kind: "payment", source: "invoice" as const }));
      receipts = await receiptsForPayments(business.id, "invoice", rows.map((x) => x.id));
    }
  }
  // Receipts: the invoice they pay.
  let paidInvoice: { id: string; number: string | null } | null = null;
  if (row.invoice_id) {
    const { data: inv } = await supabase.from("documents").select("id, number").eq("business_id", business.id).eq("id", row.invoice_id).maybeSingle();
    paidInvoice = inv ?? null;
  }
  const sendState = live ? await whatsappSendState(business.id, row.customer_id) : null;

  // "Copy of INV-2026-000003" when this draft was duplicated from another document.
  let source: { id: string; number: string | null } | null = null;
  if (row.duplicated_from) {
    const { data: s } = await supabase.from("documents").select("id, number").eq("business_id", business.id).eq("id", row.duplicated_from).maybeSingle();
    source = s ?? null;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={`${typeLabel} ${row.number ?? ""}`.trim()}
        back={{ href: localizePath(locale, "/dashboard/documents"), label: v.back }}
        actions={<StatusBadge tone={documentStatusTone[status]}>{doc.statuses[status]}</StatusBadge>}
      />
      {param(sp.saved) ? <FormAlert tone="success">{doc.saved}</FormAlert> : null}
      {param(sp.issued) ? <FormAlert tone="success">{doc.issued}</FormAlert> : null}
      {isDraft ? <FormAlert tone="info">{v.draftNote}</FormAlert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <DocumentPreview doc={data} logoUrl={business.logoUrl} />
          {data.type === "invoice" ? (
            <InvoicePaymentsPanel
              invoice={{ id: row.id, status: row.status, total: Number(row.total), paid: Number(row.amount_paid ?? 0), currency: row.currency, order }}
              payments={payments}
              receipts={receipts}
              canRecord={canAct}
              canManage={isAdmin}
              today={localToday(business.timezone)}
              locale={locale}
              t={doc.payments}
              p={d.payments}
              errors={d.errors}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex flex-col gap-2">
              <a href={pdf} className={buttonLink} data-testid="doc-pdf">
                <Download aria-hidden /> {v.download}
              </a>
              <a href={`${pdf}?inline=1`} target="_blank" rel="noopener" className={secondaryLink}>
                <Printer aria-hidden /> {v.print}
              </a>
              {canAct && isDraft ? (
                <>
                  <Link href={localizePath(locale, `/dashboard/documents/${row.id}/edit`)} className={secondaryLink}>
                    <Pencil aria-hidden /> {v.edit}
                  </Link>
                  {data.type !== "receipt" || isAdmin ? (
                    <ActionButton action={issueDocument.bind(null, row.id)} errors={d.errors} variant="default" confirm={v.issueConfirm}>
                      {v.issue}
                    </ActionButton>
                  ) : (
                    <p className="text-xs text-slate">{doc.editor.receiptAdminOnly}</p>
                  )}
                </>
              ) : null}
              {canAct && !linked && (data.type !== "receipt" || isAdmin) ? (
                <ActionButton action={duplicateDocument.bind(null, row.id, locale)} errors={d.errors}>
                  <Copy aria-hidden /> {v.duplicate}
                </ActionButton>
              ) : null}
              {canAct && data.type === "quotation" && ["sent", "accepted", "rejected"].includes(row.status) ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {row.status !== "accepted" ? (
                    <ActionButton action={setQuotationStatus.bind(null, row.id, "accepted")} errors={d.errors}>
                      {v.markAccepted}
                    </ActionButton>
                  ) : null}
                  {row.status !== "rejected" ? (
                    <ActionButton action={setQuotationStatus.bind(null, row.id, "rejected")} errors={d.errors}>
                      {v.markRejected}
                    </ActionButton>
                  ) : null}
                  {row.status !== "sent" ? (
                    <ActionButton action={setQuotationStatus.bind(null, row.id, "sent")} errors={d.errors} variant="ghost">
                      {v.markSent}
                    </ActionButton>
                  ) : null}
                </div>
              ) : null}
              {canAct && isDraft ? <DeleteButton action={deleteDraft.bind(null, row.id, locale)} labels={{ ...d.common, delete: v.delete }} errors={d.errors} /> : null}
            </div>
            {!isDraft && row.status !== "voided" ? <p className="mt-3 text-xs text-slate">{v.locked}</p> : null}
          </Panel>

          {isAdmin && !isDraft && row.status !== "voided" ? (
            <Panel title={v.voidTitle} description={v.voidText}>
              <ActionForm action={voidDocument.bind(null, row.id)} text={{ errors: d.errors, saved: doc.statuses.voided, saving: d.common.saving }} successMessage={doc.statuses.voided}>
                <TextField name="reason" label={v.voidReason} required minLength={3} maxLength={300} />
                <div>
                  <SubmitButton variant="outline">{v.voidSubmit}</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          ) : null}

          {sendState ? (
            <WhatsAppSendPanel state={sendState} action={sendDocumentWhatsApp.bind(null, row.id)} canSend={canAct} locale={locale} t={doc.whatsapp} errors={d.errors} />
          ) : null}

          <Panel title={v.history}>
            <ul className="flex flex-col gap-1.5 text-sm text-slate">
              <li>{format(v.created, { date: formatDate(row.created_at, locale, true) })}</li>
              {source ? (
                <li>
                  <Link href={localizePath(locale, `/dashboard/documents/${source.id}`)} className="font-semibold text-waza-700 hover:underline">
                    {format(v.copyOf, { number: source.number ?? doc.statuses.draft })}
                  </Link>
                </li>
              ) : null}
              {order ? (
                <li>
                  <Link href={localizePath(locale, `/dashboard/orders/${order.id}`)} className="font-semibold text-waza-700 hover:underline" data-testid="doc-order-link">
                    {format(v.fromOrder, { number: order.number })}
                  </Link>
                </li>
              ) : null}
              {paidInvoice ? (
                <li>
                  <Link href={localizePath(locale, `/dashboard/documents/${paidInvoice.id}`)} className="font-semibold text-waza-700 hover:underline" data-testid="doc-invoice-link">
                    {format(v.forInvoice, { number: paidInvoice.number ?? "" })}
                  </Link>
                </li>
              ) : null}
              {row.issued_at ? <li>{format(v.issuedOn, { date: formatDate(row.issued_at, locale, true) })}</li> : null}
              {row.voided_at ? <li className="text-coral-700">{format(v.voidedOn, { date: formatDate(row.voided_at, locale, true), reason: row.void_reason ?? "" })}</li> : null}
              {row.customer_id ? (
                <li>
                  <Link href={localizePath(locale, `/dashboard/customers/${row.customer_id}`)} className="font-semibold text-waza-700 hover:underline">
                    {v.customerProfile}
                  </Link>
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
