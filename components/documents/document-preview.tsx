import { computeTotals } from "@/lib/documents/calc";
import { DOCUMENT_LABELS, formatDocMoney, formatQuantity } from "@/lib/documents/labels";
import { STAMP_COLOURS, metaRows, paidInFull, paidRows, relatedRows, stampWord } from "@/lib/documents/layout";
import type { DocumentData } from "@/lib/documents/types";
import { cn } from "@/lib/utils";

/*
 * On-screen preview of a document: the same data, labels and totals as the PDF
 * (lib/documents/pdf/render.tsx), laid out the same way for each template.
 * The PDF is the reference; this shows instantly on any phone.
 */

const THEME = {
  classic: { font: "font-serif", accent: "#1e3a5f", head: "bg-[#1e3a5f] text-white", ink: "#1f2933" },
  modern: { font: "", accent: "#16b878", head: "bg-[#102a2a] text-white", ink: "#102a2a" },
  minimal: { font: "", accent: "#111111", head: "border-b-2 border-[#111] text-[#6b6b6b]", ink: "#111111" },
} as const;

export function DocumentPreview({ doc, logoUrl, className }: { doc: DocumentData; logoUrl?: string | null; className?: string }) {
  const L = DOCUMENT_LABELS[doc.language];
  const t = computeTotals(doc);
  const th = THEME[doc.template];
  const money = (n: number) => formatDocMoney(n, doc.currency, doc.language);
  const anyDisc = doc.items.some((i) => (i.discountPercent ?? 0) > 0);
  const lines = (p: DocumentData["business"]) => [p.reference, p.address, p.phone, p.email, p.website].filter(Boolean) as string[];
  const title = L.title[doc.type];
  const meta = metaRows(doc, L);
  const stamp = stampWord(doc, L);
  const meta_ = (dark?: boolean) => (
    <dl className="grid grid-cols-[auto_auto] justify-end gap-x-2 text-right text-[0.7rem]">
      {meta.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className={dark ? "text-[#9fd9c2]" : "text-[#55606b]"}>{k}</dt>
          <dd className={cn("font-bold", dark && "text-white")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
  const logo_ = (size: number) =>
    logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen logo (data or blob URL)
      <img src={logoUrl} alt="" style={{ width: size, height: size }} className="object-contain" />
    ) : null;

  return (
    <article
      className={cn("relative mx-auto w-full max-w-[640px] overflow-x-clip bg-white text-[0.72rem] leading-snug shadow-card ring-1 ring-black/5", th.font, className)}
      style={{ color: th.ink, aspectRatio: "210 / 297" }}
      data-testid="document-preview"
      aria-label={`${title} — preview`}
    >
      {stamp && doc.stamp ? (
        <span
          className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -rotate-[28deg] text-6xl font-bold tracking-widest uppercase opacity-15"
          style={{ color: STAMP_COLOURS[doc.stamp] }}
          data-testid="preview-stamp"
        >
          {stamp}
        </span>
      ) : null}

      {/* Header */}
      {doc.template === "modern" ? (
        <header className="bg-[#102a2a] px-[7%] pt-6 pb-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl ? (
                <span className="rounded-md bg-white p-1">
                  {logo_(36)}
                </span>
              ) : null}
              <p className="truncate font-display text-base font-extrabold">{doc.business.name || "—"}</p>
            </div>
            <p className="font-display text-xl font-extrabold text-[#16b878] uppercase">{title}</p>
          </div>
          <div className="mt-2">
            {meta_(true)}
          </div>
        </header>
      ) : doc.template === "classic" ? (
        <header className="px-[7%] pt-6">
          <div className="flex flex-col items-center text-center">
            {logo_(44)}
            <p className="mt-1 text-lg font-bold" style={{ color: th.accent }}>
              {doc.business.name || "—"}
            </p>
            <p className="text-[0.65rem] text-[#55606b]">{lines(doc.business).join("  ·  ")}</p>
          </div>
          <div className="mt-2 border-t-2" style={{ borderColor: th.accent }} />
          <div className="mt-0.5 border-t" style={{ borderColor: th.accent }} />
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-xl font-bold tracking-[0.15em] uppercase">{title}</p>
            {meta_()}
          </div>
        </header>
      ) : (
        <header className="px-[7%] pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {logo_(32)}
              <p className="mt-1 truncate text-sm font-bold">{doc.business.name || "—"}</p>
            </div>
            <p className="text-2xl font-bold tracking-tight">{title}</p>
          </div>
          <div className="mt-2">
            {meta_()}
          </div>
        </header>
      )}

      <div className="px-[7%] pb-10">
        {/* Parties */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            [L.from, doc.business],
            [L.to[doc.type], doc.customer],
          ].map(([label, p]) => {
            const party = p as DocumentData["business"];
            return (
              <div
                key={label as string}
                className={cn("min-w-0 break-words", doc.template === "classic" && "border border-[#9aa5b1] p-2", doc.template === "modern" && "rounded-md bg-[#f3faf6] p-2.5")}
              >
                <p className="text-[0.58rem] tracking-wider text-[#6b6b6b] uppercase">{label as string}</p>
                <p className="font-bold">{party.name || "—"}</p>
                {lines(party).map((l, i) => (
                  <p key={i} className="text-[#55606b]">
                    {l}
                  </p>
                ))}
              </div>
            );
          })}
        </div>

        {/* Items */}
        <table className="mt-4 w-full table-fixed border-collapse">
          <thead>
            <tr className={cn("text-[0.65rem] font-bold", THEME[doc.template].head)}>
              <th className="w-6 px-1.5 py-1.5 text-left">#</th>
              <th className="px-1.5 py-1.5 text-left">{L.description}</th>
              <th className="w-10 px-1.5 py-1.5 text-right">{L.quantity}</th>
              <th className="w-[4.5rem] px-1.5 py-1.5 text-right">{L.unitPrice}</th>
              {anyDisc ? <th className="w-10 px-1.5 py-1.5 text-right">{L.discount}</th> : null}
              <th className="w-[5rem] px-1.5 py-1.5 text-right">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i} className={cn("border-b border-[#dfe7e3] align-top", doc.template === "modern" && i % 2 === 1 && "bg-[#f3faf6]", doc.template === "classic" && "border-x border-[#9aa5b1]")}>
                <td className="px-1.5 py-1.5 text-[#6b6b6b]">{i + 1}</td>
                <td className="px-1.5 py-1.5 break-words">
                  <span className="font-semibold">{it.description || "—"}</span>
                  {it.details ? <span className="block text-[0.65rem] text-[#55606b]">{it.details}</span> : null}
                </td>
                <td className="px-1.5 py-1.5 text-right">{formatQuantity(it.quantity, doc.language)}</td>
                <td className="px-1.5 py-1.5 text-right">{money(it.unitPrice)}</td>
                {anyDisc ? <td className="px-1.5 py-1.5 text-right">{it.discountPercent ? `${formatQuantity(it.discountPercent, doc.language)} %` : ""}</td> : null}
                <td className="px-1.5 py-1.5 text-right font-semibold">{money(t.lines[i].total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-3 flex gap-4">
          <div className="min-w-0 flex-1">
            {doc.type === "receipt" && doc.payment ? (
              <div>
                <p className="text-[0.58rem] tracking-wider text-[#6b6b6b] uppercase">{L.paymentMethod}</p>
                <p className="font-bold">{L.methods[doc.payment.method]}</p>
                {doc.payment.reference ? (
                  <p className="text-[#55606b]">
                    {L.paymentReference}: {doc.payment.reference}
                  </p>
                ) : null}
                {relatedRows(doc, L, money).map(([k, v]) => (
                  <p key={k} className="text-[#55606b]">
                    {k}: {v}
                  </p>
                ))}
                {paidInFull(doc, t) ? <p className="mt-1.5 font-bold text-[#0c8354]">{L.paidInFull}</p> : null}
              </div>
            ) : null}
          </div>
          <dl className="w-[46%] shrink-0" data-testid="preview-totals">
            <div className="flex justify-between py-0.5">
              <dt className="text-[#55606b]">{L.subtotal}</dt>
              <dd>{money(t.subtotal)}</dd>
            </div>
            {t.discount > 0 ? (
              <div className="flex justify-between py-0.5">
                <dt className="text-[#55606b]">{L.discount}</dt>
                <dd>− {money(t.discount)}</dd>
              </div>
            ) : null}
            {(doc.taxRate ?? 0) > 0 ? (
              <div className="flex justify-between py-0.5">
                <dt className="text-[#55606b]">
                  {doc.taxLabel || L.tax} ({formatQuantity(doc.taxRate ?? 0, doc.language)} %)
                </dt>
                <dd>{money(t.tax)}</dd>
              </div>
            ) : null}
            <div
              className={cn(
                "mt-1 flex items-center justify-between px-1.5 py-1.5",
                doc.template === "modern" && "rounded-md bg-[#16b878] text-[#102a2a]",
                doc.template === "classic" && "border-y-2 border-[#1e3a5f]",
                doc.template === "minimal" && "border-t border-[#111]",
              )}
            >
              <dt className="font-bold">{L.total}</dt>
              <dd className="text-sm font-extrabold" data-testid="preview-total">
                {money(t.total)}
              </dd>
            </div>
            {paidRows(doc, t, L, money).map(([k, v], i) => (
              <div key={k} className={cn("flex justify-between py-0.5", i === 0 && "mt-1")}>
                <dt className="text-[#55606b]">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {doc.notes ? (
          <div className="mt-4">
            <p className="text-[0.58rem] tracking-wider text-[#6b6b6b] uppercase">{L.notes}</p>
            <p className="whitespace-pre-line">{doc.notes}</p>
          </div>
        ) : null}
        {doc.terms ? (
          <div className="mt-3">
            <p className="text-[0.58rem] tracking-wider text-[#6b6b6b] uppercase">{L.terms}</p>
            <p className="whitespace-pre-line text-[#55606b]">{doc.terms}</p>
          </div>
        ) : null}
        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="font-bold" style={{ color: doc.template === "modern" ? "#0c8354" : th.accent }}>
            {L.thanks[doc.type]}
          </p>
          {doc.template !== "minimal" ? (
            <div className="flex gap-3">
              {doc.template === "classic" ? <span className="flex h-12 w-20 items-end justify-center border border-dashed border-[#9aa5b1] pb-0.5 text-[0.58rem] text-[#6b6b6b]">{L.stamp}</span> : null}
              <span className="w-28 border-t border-current pt-0.5 text-center text-[0.58rem] text-[#6b6b6b]">{L.signature}</span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
