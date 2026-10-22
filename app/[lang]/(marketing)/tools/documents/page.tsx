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
      </section>
    </>
  );
}
