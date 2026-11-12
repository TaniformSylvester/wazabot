import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { DocumentEditor } from "@/components/documents/document-editor";
import { newEditorState } from "@/lib/documents/editor-state";
import { PageIntro } from "@/components/marketing/page-intro";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = () => pageMetadata("documentTool", "/tools/documents");

/** Free invoice, receipt and quotation generator: no account, nothing saved (PDF made by /api/documents/guest). */
export default async function GuestDocumentsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const g = t.docs.guest;
  return (
    <>
      <PageIntro eyebrow={g.eyebrow} title={g.title} description={g.intro} />
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <DocumentEditor
          mode="guest"
          t={t.docs}
          validation={t.auth.validation}
          initial={newEditorState({ language: locale })}
          registerHref={localizePath(locale, "/register")}
        />
        {/* A quiet invitation under the generator: what an account adds (it never blocks the free tool). */}
        <aside aria-labelledby="doc-trial-title" className="mt-10 grid gap-5 rounded-2xl border border-waza-100 bg-mint p-6 md:grid-cols-[1.4fr_1fr] md:items-center" data-testid="doc-trial-banner">
          <div>
            <h2 id="doc-trial-title" className="type-h3 text-lg">
              {g.banner.title}
            </h2>
            <p className="mt-1 text-sm text-slate">{g.banner.text}</p>
            <ul className="mt-3 grid gap-1.5 text-sm text-deep sm:grid-cols-2">
              {g.banner.points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <Link href={localizePath(locale, "/register")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
              {g.banner.cta} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="text-xs text-slate">{g.banner.note}</p>
          </div>
        </aside>
      </section>
    </>
  );
}
