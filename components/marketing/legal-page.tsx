import { PageIntro } from "@/components/marketing/page-intro";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/lib/i18n/config";
import type { LegalBlock, LegalDoc } from "@/lib/legal/types";

/** Who runs WazaBolt, from config/site.ts → legal (registered details only once they are filled in). */
function operatorLine(locale: Locale) {
  const { entityName, rccm, niu } = siteConfig.legal;
  const address = siteConfig.contact.address;
  if (!entityName) return locale === "fr" ? `WazaBolt est exploité depuis : ${address}.` : `WazaBolt is operated from ${address}.`;
  const ids = [rccm ? `RCCM ${rccm}` : null, niu ? `NIU ${niu}` : null].filter(Boolean).join(", ");
  return locale === "fr" ? `WazaBolt est exploité par ${entityName}${ids ? ` (${ids})` : ""}, ${address}.` : `WazaBolt is operated by ${entityName}${ids ? ` (${ids})` : ""}, ${address}.`;
}

function fill(text: string, locale: Locale) {
  return text
    .replaceAll("{operator}", operatorLine(locale))
    .replaceAll("{email}", siteConfig.contact.email)
    .replaceAll("{phone}", siteConfig.contact.phone)
    .replaceAll("{address}", siteConfig.contact.address)
    .replaceAll("{site}", siteConfig.url);
}

function Block({ block, locale }: { block: LegalBlock; locale: Locale }) {
  if (typeof block === "string") return <p className="type-body text-slate">{fill(block, locale)}</p>;
  return (
    <ul className="type-body list-disc space-y-2 pl-5 text-slate marker:text-waza-500">
      {block.list.map((item) => (
        <li key={item}>{fill(item, locale)}</li>
      ))}
    </ul>
  );
}

/** Privacy Policy / Terms of Service: title, date, contents, numbered sections. */
export function LegalPage({ doc, locale }: { doc: LegalDoc; locale: Locale }) {
  const updated = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(siteConfig.legal.updated));
  return (
    <>
      <PageIntro eyebrow={doc.eyebrow} title={doc.title} description={`${doc.updatedLabel}${locale === "fr" ? " : " : ": "}${updated}`} />
      <div className="container-page grid max-w-5xl gap-10 pb-20 pt-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={doc.tocLabel} className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-wider text-waza-700">{doc.tocLabel}</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-block py-1 text-slate hover:text-deep hover:underline">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-4">
            {doc.intro.map((p) => (
              <p key={p} className="type-lead text-deep">
                {fill(p, locale)}
              </p>
            ))}
          </div>
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 border-t border-line pt-6">
              <h2 id={`${s.id}-title`} className="type-h3 text-xl">
                {s.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {s.body.map((b, i) => (
                  <Block key={i} block={b} locale={locale} />
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
