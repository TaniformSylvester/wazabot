import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";

import { PageHeader, Panel, TableWrap, buttonLink, param, secondaryLink, td, th } from "@/components/app/ui";
import { WhatsAppSendPanel } from "@/components/documents/whatsapp-panel";
import { sendStatementWhatsApp } from "@/lib/actions/document-links";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { whatsappSendState } from "@/lib/data/documents";
import { customerStatement } from "@/lib/data/statements";
import { formatDocDate, formatDocMoney } from "@/lib/documents/labels";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.statements.title);

/** A customer's statement of account: billed, paid, running balance; PDF, print and WhatsApp. */
export default async function StatementPage({ params, searchParams }: PageProps<"/[lang]/dashboard/customers/[id]/statement">) {
  const [locale, t, { id }, sp] = await Promise.all([getLocale(), getMessages(), params, searchParams]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/customers/${id}/statement`));
  const lang = param(sp.lang);
  const st = isUuid(id) ? await customerStatement(business, id, { from: param(sp.from), to: param(sp.to), language: lang }) : null;
  if (!st) notFound();
  const d = t.dashboard;
  const s = d.statements;
  const base = localizePath(locale, `/dashboard/customers/${id}/statement`);
  const query = new URLSearchParams({ ...(st.from ? { from: st.from } : {}), to: st.to, lang: st.language }).toString();
  const pdf = `${base}/pdf?${query}`;
  // Amounts and dates in the statement's own language, as on the PDF.
  const money = (n: number) => formatDocMoney(n, st.currency, st.language);
  const date = (v: string) => formatDocDate(v, st.language);
  const sendState = await whatsappSendState(business.id, id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={s.title} description={format(s.description, { name: st.customer.name })} back={{ href: localizePath(locale, `/dashboard/customers/${id}`), label: st.customer.name }} />

      <form method="get" action={base} className="flex flex-wrap items-end gap-3" data-testid="statement-filters">
        <label className="flex flex-col gap-1 text-sm font-semibold text-deep">
          {s.from}
          <input type="date" name="from" defaultValue={st.from ?? ""} max={st.to} className="h-10 rounded-xl border border-input bg-card px-3 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-deep">
          {s.to}
          <input type="date" name="to" defaultValue={st.to} max={st.issuedOn} className="h-10 rounded-xl border border-input bg-card px-3 text-sm font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-deep">
          {s.language}
          <select name="lang" defaultValue={st.language} className="h-10 rounded-xl border border-input bg-card px-3 text-sm font-normal">
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        <button type="submit" className={secondaryLink}>
          {s.apply}
        </button>
        <p className="basis-full text-xs text-slate">{s.fromHint}</p>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm text-slate">
              {st.from ? `${date(st.from)} – ${date(st.to)}` : `– ${date(st.to)}`}
            </p>
            <p className={`font-display text-lg font-bold ${st.closing > 0 ? "text-coral-700" : "text-deep"}`} data-testid="statement-closing">
              {s.closing}: {money(st.closing)}
            </p>
          </div>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>{s.columns.date}</th>
                <th className={th}>{s.columns.reference}</th>
                <th className={th}>{s.columns.description}</th>
                <th className={`${th} text-right`}>{s.columns.charge}</th>
                <th className={`${th} text-right`}>{s.columns.payment}</th>
                <th className={`${th} text-right`}>{s.columns.balance}</th>
              </tr>
            </thead>
            <tbody data-testid="statement-rows">
              {st.from ? (
                <tr>
                  <td className={`${td} text-slate`}>{date(st.from)}</td>
                  <td className={td} />
                  <td className={`${td} font-semibold`}>{s.opening}</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={`${td} text-right font-semibold whitespace-nowrap`} data-testid="statement-opening">
                    {money(st.opening)}
                  </td>
                </tr>
              ) : null}
              {st.lines.map((l, i) => (
                <tr key={i}>
                  <td className={`${td} whitespace-nowrap text-slate`}>{date(l.date)}</td>
                  <td className={`${td} font-semibold whitespace-nowrap`}>{l.reference}</td>
                  <td className={td}>{l.description}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{l.charge ? money(l.charge) : ""}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{l.payment ? money(l.payment) : ""}</td>
                  <td className={`${td} text-right font-semibold whitespace-nowrap`}>{money(l.balance)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {!st.lines.length ? <p className="mt-3 text-sm text-slate">{s.empty}</p> : null}
          <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1.5 text-sm" data-testid="statement-totals">
            {[
              ...(st.from ? [[s.opening, money(st.opening)]] : []),
              [s.totalCharges, money(st.totalCharges)],
              [s.totalPayments, money(st.totalPayments)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate">{k}</dt>
                <dd className="text-deep">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base">
              <dt className="font-semibold text-deep">{s.closing}</dt>
              <dd className="font-bold text-deep">{money(st.closing)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate">{s.what}</p>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex flex-col gap-2">
              <a href={pdf} className={buttonLink} data-testid="statement-pdf">
                <Download aria-hidden /> {s.download}
              </a>
              <a href={`${pdf}&inline=1`} target="_blank" rel="noopener" className={secondaryLink}>
                <Printer aria-hidden /> {s.print}
              </a>
            </div>
          </Panel>
          <WhatsAppSendPanel
            state={sendState}
            action={sendStatementWhatsApp.bind(null, id, { from: st.from, to: st.to, language: st.language })}
            canSend={hasRole(business.role, "agent")}
            locale={locale}
            t={d.documents.whatsapp}
            errors={d.errors}
          />
        </div>
      </div>
    </div>
  );
}
