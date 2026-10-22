"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Eye, FileText, ImagePlus, Loader2, Pencil, Plus, Printer, Receipt, ScrollText, Trash2, X } from "lucide-react";

import { DocumentPreview } from "@/components/documents/document-preview";
import { Button } from "@/components/ui/button";
import { computeTotals } from "@/lib/documents/calc";
import { addDays, emptyLine, emptyParty, num, toDocument, type CatalogChoice, type CustomerChoice, type EditorState, type LineState, type Party, type SubmitResult } from "@/lib/documents/editor-state";
import { DOCUMENT_LABELS, formatDocMoney } from "@/lib/documents/labels";
import {
  DOCUMENT_CURRENCIES,
  DOCUMENT_LANGUAGES,
  DOCUMENT_TEMPLATES,
  DOCUMENT_TYPES,
  RECEIPT_METHODS,
  type DocumentCurrency,
  type DocumentData,
  type DocumentLanguage,
  type DocumentTemplate,
  type DocumentType,
  type ReceiptMethod,
} from "@/lib/documents/types";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

/*
 * The document form, shared by the guest generator (/tools/documents) and the
 * dashboard (Documents → New). Live preview from the same engine as the PDF.
 * Guests download/print a PDF made by /api/documents/guest (nothing saved);
 * businesses save drafts and issue numbered documents through a Server Action.
 */

export type BusinessText = { saveDraft: string; saveIssue: string; saving: string; chooseCustomer: string; newCustomer: string; addFromCatalog: string; products: string; services: string; numberOnIssue: string; receiptAdminOnly: string; businessFromProfile: string; editProfile: string; profileHref: string; errors: Record<string, string> };

const input =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-[0.9375rem] text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15 aria-[invalid=true]:border-coral-500";
const TYPE_ICONS = { invoice: FileText, receipt: Receipt, quotation: ScrollText } as const;
const REMEMBER_KEY = "wazabolt.docs.business";

export function DocumentEditor({
  mode,
  t,
  validation,
  initial,
  fixedLogoUrl,
  customers = [],
  catalog = [],
  business,
  canIssueReceipt = true,
  onSubmit,
  loginHref,
  registerHref,
}: {
  mode: "guest" | "business";
  t: Messages["docs"];
  validation: Record<string, string>;
  initial: EditorState;
  /** Business documents: the business's own logo (Settings), not editable here. */
  fixedLogoUrl?: string | null;
  customers?: CustomerChoice[];
  catalog?: CatalogChoice[];
  business?: BusinessText;
  canIssueReceipt?: boolean;
  onSubmit?: (doc: DocumentData, customerId: string | null, intent: "save" | "issue") => Promise<SubmitResult>;
  loginHref?: string;
  registerHref?: string;
}) {
  const [s, setS] = useState<EditorState>(initial);
  const [logo, setLogo] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(Math.max(0, ...initial.items.map((i) => i.key)) + 1);
  const f = t.fields;

  // Guests: business details remembered on this device only if they ask (never sent anywhere until they make a PDF).
  useEffect(() => {
    if (mode !== "guest") return;
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (!saved) return;
      const v = JSON.parse(saved) as { business?: Party; logo?: string | null };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the visitor's own saved details after mount (localStorage isn't available during SSR)
      if (v.business) setS((st) => ({ ...st, business: { ...emptyParty, ...v.business } }));
      if (v.logo) setLogo(v.logo);
      setRemember(true);
    } catch {
      /* storage unavailable: start empty */
    }
  }, [mode]);
  useEffect(() => {
    if (mode !== "guest") return;
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ business: s.business, logo: logo && logo.length < 400_000 ? logo : null }));
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore */
    }
  }, [mode, remember, s.business, logo]);

  const doc = useMemo(() => toDocument(s, mode === "business" ? "draft" : null), [s, mode]);
  const totals = useMemo(() => computeTotals(doc), [doc]);
  const money = (n: number) => formatDocMoney(n, s.currency, s.language);
  const set = (patch: Partial<EditorState>) => {
    setS((st) => ({ ...st, ...patch }));
    setDone(false);
  };
  const setParty = (who: "business" | "customer", patch: Partial<Party>) => set({ [who]: { ...s[who], ...patch } } as Partial<EditorState>);
  const setLine = (key: number, patch: Partial<LineState>) => set({ items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  const err = (path: string) => issues[path];
  const fieldError = (path: string) =>
    issues[path] ? (
      <p role="alert" className="mt-1 text-xs font-medium text-coral-700">
        {issues[path]}
      </p>
    ) : null;

  const changeType = (type: DocumentType) => {
    const due = type === "invoice" ? addDays(s.issueDate, 14) : type === "quotation" ? addDays(s.issueDate, 30) : "";
    set({ type, dueDate: due });
  };

  const onLogo = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) return setError(t.errors.logo_invalid);
    const r = new FileReader();
    r.onload = () => setLogo(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(file);
  };

  /** Quick checks before anything is sent (the server checks everything again). */
  const localIssues = () => {
    const out: Record<string, string> = {};
    if (!s.business.name.trim()) out["business.name"] = validation.required;
    if (!s.customer.name.trim()) out["customer.name"] = validation.required;
    s.items.forEach((i, n) => {
      if (!i.description.trim()) out[`items.${n}.description`] = validation.required;
      if (!(num(i.quantity) > 0)) out[`items.${n}.quantity`] = validation.invalid_quantity;
    });
    if (s.type !== "receipt" && s.dueDate && s.dueDate < s.issueDate) out.dueDate = validation.due_before_issue;
    return out;
  };
  const fromServer = (list?: { path: string; message: string }[]) => Object.fromEntries((list ?? []).map((i) => [i.path, validation[i.message] ?? validation.required]));

  async function makePdf(): Promise<Blob | null> {
    const local = localIssues();
    setIssues(local);
    if (Object.keys(local).length) {
      setError(t.errors.invalid);
      return null;
    }
    setError(null);
    try {
      const res = await fetch("/api/documents/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: toDocument(s), logo }) });
      if (res.ok) return await res.blob();
      const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: string; message: string }[] };
      setIssues(fromServer(body.issues));
      setError(t.errors[(body.error ?? "failed") as keyof typeof t.errors] ?? t.errors.failed);
    } catch {
      setError(t.errors.network);
    }
    return null;
  }

  const download = () =>
    startTransition(async () => {
      const blob = await makePdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${DOCUMENT_LABELS[s.language].title[s.type].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}${s.number.trim() ? `-${s.number.trim().replace(/[^A-Za-z0-9_-]/g, "")}` : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(true);
    });

  const print = () =>
    startTransition(async () => {
      const blob = await makePdf();
      if (!blob) return;
      printPdf(blob);
      setDone(true);
    });

  const submit = (intent: "save" | "issue") =>
    startTransition(async () => {
      if (!onSubmit) return;
      const local = localIssues();
      setIssues(local);
      if (Object.keys(local).length) return setError(t.errors.invalid);
      setError(null);
      try {
        const r = await onSubmit(toDocument(s), s.customerId, intent);
        // Success redirects to the document; only failures come back here.
        if (r && !r.ok) {
          setIssues(fromServer(r.issues));
          setError(business?.errors[r.error] ?? t.errors[r.error as keyof typeof t.errors] ?? t.errors.failed);
        }
      } catch {
        setError(t.errors.failed);
      }
    });

  const pickCustomer = (id: string) => {
    if (!id) return set({ customerId: null, customer: { ...emptyParty } });
    const c = customers.find((x) => x.id === id);
    if (c) set({ customerId: c.id, customer: { name: c.name, reference: c.reference, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", website: "" } });
  };
  const addFromCatalog = (key: string) => {
    const c = catalog.find((x) => x.key === key);
    if (!c) return;
    const line: LineState = { ...emptyLine(nextKey.current++), description: c.label, unitPrice: String(c.unitPrice), productId: c.productId ?? null, variantId: c.variantId ?? null, serviceId: c.serviceId ?? null };
    const blank = s.items.length === 1 && !s.items[0].description && !s.items[0].unitPrice;
    set({ items: blank ? [line] : [...s.items, line] });
  };

  const partyFields = (who: "business" | "customer") => {
    const p = s[who];
    const k = (name: keyof Party) => `${who}.${name}`;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field fe={fieldError} label={who === "business" ? f.businessName : f.customerName} path={k("name")} className="sm:col-span-2">
          <input className={input} value={p.name} maxLength={160} aria-invalid={!!err(k("name"))} onChange={(e) => setParty(who, { name: e.target.value })} />
        </Field>
        <Field fe={fieldError} label={who === "business" ? f.businessPhone : f.customerPhone} path={k("phone")}>
          <input className={input} value={p.phone} maxLength={40} inputMode="tel" onChange={(e) => setParty(who, { phone: e.target.value })} />
        </Field>
        <Field fe={fieldError} label={who === "business" ? f.businessEmail : f.customerEmail} path={k("email")}>
          <input className={input} value={p.email} maxLength={160} inputMode="email" onChange={(e) => setParty(who, { email: e.target.value })} />
        </Field>
        <Field fe={fieldError} label={who === "business" ? f.businessAddress : f.customerAddress} path={k("address")} className="sm:col-span-2">
          <input className={input} value={p.address} maxLength={300} onChange={(e) => setParty(who, { address: e.target.value })} />
        </Field>
        {who === "business" ? (
          <>
            <Field fe={fieldError} label={f.businessReference} path={k("reference")}>
              <input className={input} value={p.reference} maxLength={60} onChange={(e) => setParty(who, { reference: e.target.value })} />
            </Field>
            <Field fe={fieldError} label={f.businessWebsite} path={k("website")}>
              <input className={input} value={p.website} maxLength={160} onChange={(e) => setParty(who, { website: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field fe={fieldError} label={f.customerReference} path={k("reference")}>
            <input className={input} value={p.reference} maxLength={60} onChange={(e) => setParty(who, { reference: e.target.value })} />
          </Field>
        )}
      </div>
    );
  };

  const logoUrl = mode === "business" ? fixedLogoUrl : logo;

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:pb-0">
      <div className={cn("flex min-w-0 flex-col gap-5", showPreview && "hidden lg:flex")}>
        <Section n={1} title={t.sections.type}>
          <div role="radiogroup" aria-label={t.sections.type} className="grid gap-2 sm:grid-cols-3">
            {DOCUMENT_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type];
              const disabled = type === "receipt" && !canIssueReceipt;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={s.type === type}
                  disabled={disabled}
                  title={disabled ? business?.receiptAdminOnly : undefined}
                  onClick={() => changeType(type)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:opacity-40",
                    s.type === type ? "border-waza-600 bg-mint ring-2 ring-waza-500/25" : "border-border enabled:hover:border-waza-500",
                  )}
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-waza-700" aria-hidden />
                  <span>
                    <span className="block font-bold text-deep">{t.types[type]}</span>
                    <span className="block text-xs text-slate">{t.typeHints[type]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!canIssueReceipt && business ? <p className="mt-2 text-xs text-slate">{business.receiptAdminOnly}</p> : null}
        </Section>

        <Section n={2} title={t.sections.template}>
          <div role="radiogroup" aria-label={t.sections.template} className="grid gap-2 sm:grid-cols-3">
            {DOCUMENT_TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                type="button"
                role="radio"
                aria-checked={s.template === tpl}
                onClick={() => set({ template: tpl })}
                className={cn("rounded-2xl border p-3 text-left", s.template === tpl ? "border-waza-600 bg-mint ring-2 ring-waza-500/25" : "border-border hover:border-waza-500")}
              >
                <TemplateSwatch template={tpl} />
                <span className="mt-2 block font-bold text-deep">{t.templates[tpl].name}</span>
                <span className="block text-xs text-slate">{t.templates[tpl].hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field fe={fieldError} label={f.language}>
              <select className={input} value={s.language} onChange={(e) => set({ language: e.target.value as DocumentLanguage })}>
                {DOCUMENT_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l === "fr" ? "Français" : "English"}
                  </option>
                ))}
              </select>
            </Field>
            <Field fe={fieldError} label={f.currency}>
              <select className={input} value={s.currency} onChange={(e) => set({ currency: e.target.value as DocumentCurrency })} disabled={mode === "business"}>
                {DOCUMENT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "XAF" ? "FCFA (XAF)" : c === "XOF" ? "FCFA (XOF)" : c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section n={3} title={t.sections.business}>
          {mode === "guest" ? (
            <div className="mb-4 flex flex-wrap items-center gap-4">
              {logo ? (
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen logo */}
                  <img src={logo} alt="" className="size-14 rounded-lg border border-border object-contain" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
                    <X aria-hidden /> {f.removeLogo}
                  </Button>
                </span>
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-semibold text-deep hover:bg-waza-100">
                <ImagePlus className="size-4" aria-hidden /> {f.logo}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
              </label>
              <span className="text-xs text-slate">{f.logoHint}</span>
            </div>
          ) : null}
          {mode === "business" && business ? (
            <div className="rounded-2xl bg-surface p-4 text-sm text-deep" data-testid="doc-business">
              {fixedLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- business logo from Storage
                <img src={fixedLogoUrl} alt="" className="mb-2 size-12 rounded-lg object-contain" />
              ) : null}
              <p className="font-bold">{s.business.name}</p>
              {[s.business.reference, s.business.address, s.business.phone, s.business.email, s.business.website].filter(Boolean).map((l) => (
                <p key={l} className="text-slate">
                  {l}
                </p>
              ))}
              <p className="mt-3 text-xs text-slate">
                {business.businessFromProfile}{" "}
                <a href={business.profileHref} className="font-semibold text-waza-700 underline">
                  {business.editProfile}
                </a>
              </p>
            </div>
          ) : (
            partyFields("business")
          )}
          {mode === "guest" ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-deep">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-waza-600" />
              {t.guest.remember}
            </label>
          ) : null}
        </Section>

        <Section n={4} title={t.sections.customer}>
          {mode === "business" && business ? (
            <Field fe={fieldError} label={business.chooseCustomer} className="mb-4">
              <select className={input} value={s.customerId ?? ""} onChange={(e) => pickCustomer(e.target.value)} data-testid="doc-customer-select">
                <option value="">{business.newCustomer}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.reference}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {partyFields("customer")}
        </Section>

        <Section n={5} title={t.sections.items}>
          {mode === "business" && business && catalog.length ? (
            <Field fe={fieldError} label={business.addFromCatalog} className="mb-4">
              <select className={input} value="" onChange={(e) => addFromCatalog(e.target.value)} data-testid="doc-catalog-select">
                <option value="">—</option>
                {(["product", "service"] as const).map((kind) => {
                  const list = catalog.filter((c) => (kind === "service" ? c.serviceId : !c.serviceId));
                  return list.length ? (
                    <optgroup key={kind} label={kind === "service" ? business.services : business.products}>
                      {list.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label} — {money(c.unitPrice)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </Field>
          ) : null}
          <ol className="flex flex-col gap-3">
            {s.items.map((it, n) => (
              <li key={it.key} className="rounded-2xl border border-border p-3" data-testid="doc-line">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_5.5rem]">
                  <Field fe={fieldError} label={f.description} path={`items.${n}.description`} className="col-span-2 sm:col-span-1">
                    <input className={input} value={it.description} maxLength={300} aria-invalid={!!err(`items.${n}.description`)} onChange={(e) => setLine(it.key, { description: e.target.value })} />
                  </Field>
                  <Field fe={fieldError} label={f.quantity} path={`items.${n}.quantity`}>
                    <input className={input} value={it.quantity} inputMode="decimal" aria-invalid={!!err(`items.${n}.quantity`)} onChange={(e) => setLine(it.key, { quantity: e.target.value })} />
                  </Field>
                  <Field fe={fieldError} label={f.unitPrice} path={`items.${n}.unitPrice`}>
                    <input className={input} value={it.unitPrice} inputMode="decimal" onChange={(e) => setLine(it.key, { unitPrice: e.target.value })} />
                  </Field>
                  <Field fe={fieldError} label={f.discountPercent} path={`items.${n}.discountPercent`}>
                    <input className={input} value={it.discountPercent} inputMode="decimal" placeholder="0" onChange={(e) => setLine(it.key, { discountPercent: e.target.value })} />
                  </Field>
                  <Field fe={fieldError} label={f.details} className="col-span-2 sm:col-span-3">
                    <input className={input} value={it.details} maxLength={1000} onChange={(e) => setLine(it.key, { details: e.target.value })} />
                  </Field>
                  <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                    <span className="text-sm font-bold text-deep" aria-label={f.lineTotal}>
                      {money(totals.lines[n]?.total ?? 0)}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={format(f.removeLine, { n: n + 1 })} disabled={s.items.length === 1} onClick={() => set({ items: s.items.filter((x) => x.key !== it.key) })}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {fieldError("items")}
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => set({ items: [...s.items, emptyLine(nextKey.current++)] })}>
            <Plus aria-hidden /> {f.addLine}
          </Button>
        </Section>

        <Section n={6} title={t.sections.details}>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "guest" ? (
              <Field fe={fieldError} label={f.number} hint={f.numberHint} path="number">
                <input className={input} value={s.number} maxLength={40} onChange={(e) => set({ number: e.target.value })} />
              </Field>
            ) : (
              <p className="self-end text-sm text-slate sm:col-span-2">{business?.numberOnIssue}</p>
            )}
            <Field fe={fieldError} label={f.issueDate} path="issueDate">
              <input type="date" className={input} value={s.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
            </Field>
            {s.type !== "receipt" ? (
              <Field fe={fieldError} label={s.type === "invoice" ? f.dueDate : f.validUntil} path="dueDate">
                <input type="date" className={input} value={s.dueDate} aria-invalid={!!err("dueDate")} onChange={(e) => set({ dueDate: e.target.value })} />
              </Field>
            ) : null}
            <Field fe={fieldError} label={f.discount} path="discount">
              <input className={input} value={s.discount} inputMode="decimal" placeholder="0" onChange={(e) => set({ discount: e.target.value })} />
            </Field>
            <Field fe={fieldError} label={f.taxRate} path="taxRate">
              <input className={input} value={s.taxRate} inputMode="decimal" placeholder="0" onChange={(e) => set({ taxRate: e.target.value })} />
            </Field>
            <Field fe={fieldError} label={f.taxLabel} path="taxLabel">
              <input className={input} value={s.taxLabel} maxLength={30} placeholder={f.taxLabelPlaceholder} onChange={(e) => set({ taxLabel: e.target.value })} />
            </Field>
          </div>
        </Section>

        {s.type === "receipt" ? (
          <Section n={7} title={t.sections.payment}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field fe={fieldError} label={f.paymentMethod}>
                <select className={input} value={s.payment.method} onChange={(e) => set({ payment: { ...s.payment, method: e.target.value as ReceiptMethod } })}>
                  {RECEIPT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {DOCUMENT_LABELS[s.language].methods[m]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field fe={fieldError} label={f.amountPaid} path="payment.amountPaid">
                <input className={input} value={s.payment.amountPaid} inputMode="decimal" placeholder={String(totals.total)} onChange={(e) => set({ payment: { ...s.payment, amountPaid: e.target.value } })} />
              </Field>
              <Field fe={fieldError} label={f.paymentReference} path="payment.reference">
                <input className={input} value={s.payment.reference} maxLength={80} onChange={(e) => set({ payment: { ...s.payment, reference: e.target.value } })} />
              </Field>
            </div>
          </Section>
        ) : null}

        <Section n={s.type === "receipt" ? 8 : 7} title={t.sections.notes}>
          <div className="grid gap-4">
            <Field fe={fieldError} label={f.notes} path="notes">
              <textarea className={cn(input, "h-auto py-2")} rows={2} value={s.notes} maxLength={2000} placeholder={f.notesPlaceholder} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
            <Field fe={fieldError} label={f.terms} path="terms">
              <textarea className={cn(input, "h-auto py-2")} rows={2} value={s.terms} maxLength={2000} placeholder={f.termsPlaceholder} onChange={(e) => set({ terms: e.target.value })} />
            </Field>
          </div>
        </Section>
      </div>

      {/* Preview + actions */}
      <aside className={cn("flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:h-fit", !showPreview && "hidden lg:flex")} aria-label={t.sections.preview}>
        <DocumentPreview doc={doc} logoUrl={logoUrl} />
        <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <p className="flex items-baseline justify-between text-sm text-slate">
            {t.summary.total} <span className="font-display text-xl font-bold text-deep">{money(totals.total)}</span>
          </p>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl bg-coral-50 px-3 py-2 text-sm font-medium text-coral-700">
              {error}
            </p>
          ) : null}
          {mode === "guest" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={download} disabled={pending} data-testid="doc-download">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} {pending ? t.actions.downloading : t.actions.download}
              </Button>
              <Button type="button" variant="secondary" onClick={print} disabled={pending}>
                <Printer aria-hidden /> {t.actions.print}
              </Button>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => submit("save")} disabled={pending} data-testid="doc-save">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} {business?.saveDraft}
              </Button>
              <Button type="button" onClick={() => submit("issue")} disabled={pending || (s.type === "receipt" && !canIssueReceipt)} data-testid="doc-issue">
                {business?.saveIssue}
              </Button>
            </div>
          )}
          {done && mode === "guest" ? (
            <div className="mt-4 rounded-2xl bg-mint p-4" data-testid="doc-invite">
              <p className="text-sm font-semibold text-waza-700">{t.downloaded}</p>
              <p className="mt-2 font-bold text-deep">{t.invite.title}</p>
              <p className="mt-1 text-sm text-slate">{t.invite.text}</p>
              {registerHref ? (
                <a href={registerHref} className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">
                  {t.invite.cta}
                </a>
              ) : null}
              {loginHref ? null : null}
            </div>
          ) : null}
          {mode === "guest" ? <p className="mt-3 text-xs text-slate">{t.guest.privacy}</p> : null}
        </div>
      </aside>

      {/* Phones: switch between the form and the preview. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <Button type="button" variant="secondary" className="w-full" onClick={() => setShowPreview((v) => !v)} data-testid="doc-toggle-preview">
          {showPreview ? <Pencil aria-hidden /> : <Eye aria-hidden />} {showPreview ? t.actions.hidePreview : t.actions.showPreview}
          <span className="ml-auto font-bold">{money(totals.total)}</span>
        </Button>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-base font-bold text-deep">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-sm text-waza-700">{n}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, path, children, className, hint, fe }: { label: string; path?: string; children: React.ReactNode; className?: string; hint?: string; fe: (path: string) => React.ReactNode }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-deep", className)}>
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-slate">{hint}</span> : null}
      {path ? fe(path) : null}
    </label>
  );
}

/** A small drawing of each template, so people can tell them apart before choosing. */
function TemplateSwatch({ template }: { template: DocumentTemplate }) {
  return (
    <span aria-hidden className="block h-16 overflow-hidden rounded-lg border border-border bg-white p-1.5">
      {template === "modern" ? <span className="block h-4 rounded-sm bg-[#102a2a]" /> : null}
      {template === "classic" ? (
        <>
          <span className="mx-auto block h-1.5 w-1/2 rounded-sm bg-[#1e3a5f]" />
          <span className="mt-1 block h-0.5 bg-[#1e3a5f]" />
        </>
      ) : null}
      {template === "minimal" ? <span className="ml-auto block h-2 w-1/3 rounded-sm bg-[#111]" /> : null}
      <span className={cn("mt-1.5 block h-1.5", template === "minimal" ? "border-b border-[#111]" : template === "modern" ? "bg-[#102a2a]" : "bg-[#1e3a5f]")} />
      <span className="mt-1 block h-1 w-5/6 bg-black/10" />
      <span className="mt-1 block h-1 w-2/3 bg-black/10" />
      <span className={cn("mt-1 ml-auto block h-2 w-1/3 rounded-sm", template === "modern" ? "bg-[#16b878]" : "bg-black/20")} />
    </span>
  );
}

/** Opens the print dialog for a PDF (desktop); phones that can't print in place get the PDF in a new tab. */
function printPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
