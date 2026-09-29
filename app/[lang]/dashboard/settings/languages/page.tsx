import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LanguageSettingsForm } from "@/components/dashboard/language-settings-form";
import { canManageBusiness, getBusinessAiSettings, getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = () => pageMetadata("languages", "/dashboard/settings/languages", { index: false });

/** FUNCTIONAL — reply languages, language mode and response style, saved to business_languages + ai_settings. */
export default async function LanguageSettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  await requireUser(localizePath(locale, "/dashboard/settings/languages"));
  const [business, settings] = await Promise.all([getCurrentBusiness(), getBusinessAiSettings()]);
  const l = t.dashboard.languages;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link
          href={localizePath(locale, "/dashboard/settings")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> {l.back}
        </Link>
        <h1 className="type-h2 mt-3">{l.title}</h1>
        <p className="type-body mt-1 max-w-3xl text-slate">{l.intro}</p>
      </div>

      {business && settings ? (
        <LanguageSettingsForm
          t={l}
          canEdit={canManageBusiness(business.role)}
          initial={{
            mode: settings.language.mode,
            defaultLanguage: settings.language.defaultLanguage,
            enabledLanguages: settings.language.enabledLanguages,
            tone: settings.style.tone,
            formality: settings.style.formality,
            emojiLevel: settings.style.emojiLevel,
            replyLength: settings.style.replyLength,
            mirrorCodeSwitching: settings.style.mirrorCodeSwitching,
            styleNotes: settings.style.styleNotes,
          }}
        />
      ) : null}
    </div>
  );
}
