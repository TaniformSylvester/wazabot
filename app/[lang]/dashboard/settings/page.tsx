import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getCurrentBusiness, requireUser } from "@/lib/auth/dal";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { languageName } from "@/lib/i18n/languages";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = () => pageMetadata("settings", "/dashboard/settings", { index: false });

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm text-slate">{label}</dt>
      <dd className="text-sm font-medium text-deep sm:text-right">{value}</dd>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-3xl border border-border bg-card p-6 shadow-card md:grid-cols-[14rem_1fr] md:gap-10 sm:p-8">
      <div>
        <h2 id={id} className="type-h3">{title}</h2>
        <p className="type-small mt-1 text-slate">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const [user, business] = await Promise.all([requireUser(localizePath(locale, "/dashboard/settings")), getCurrentBusiness()]);
  const s = t.dashboard.settings;
  const countries: Record<string, string> = s.countries;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="type-h2">{s.title}</h1>

      <Section id="account-title" title={s.account.title} description={s.account.description}>
        <dl className="divide-y divide-border">
          <Row label={s.account.name} value={user.fullName || "—"} />
          <Row label={s.account.email} value={user.email} />
        </dl>
      </Section>

      <Section id="interface-title" title={s.interface.title} description={s.interface.description}>
        <LanguageSwitcher persist />
      </Section>

      {business ? (
        <Section id="business-title" title={s.business.title} description={s.business.description}>
          <dl className="divide-y divide-border">
            <Row label={s.business.name} value={business.name} />
            <Row label={s.business.role} value={t.dashboard.header.roles[business.role]} />
            <Row label={s.business.country} value={countries[business.countryCode] ?? business.countryCode} />
            <Row label={s.business.currency} value={business.currency} />
            <Row label={s.business.timezone} value={business.timezone} />
            <Row label={s.business.replyLanguages} value={business.languages.map((l) => languageName(l, locale)).join(", ")} />
            <Row label={s.business.defaultLanguage} value={languageName(business.defaultLanguage, locale)} />
          </dl>
          <Link
            href={localizePath(locale, "/dashboard/settings/languages")}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline"
          >
            {s.business.manageLanguages} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Section>
      ) : null}

      <Section id="security-title" title={s.password.title} description={s.password.description}>
        <div className="max-w-md">
          <ResetPasswordForm continueHref="/dashboard/settings" submitLabel={s.password.submit} />
        </div>
      </Section>
    </div>
  );
}
