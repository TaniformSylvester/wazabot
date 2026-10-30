import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { BusinessProfileForm, OpeningHoursForm, ReceiptSettingsForm } from "@/components/app/business-forms";
import { ActionButton } from "@/components/app/form";
import { CopyText } from "@/components/app/copy-button";
import { DefinitionList, PageHeader, Panel, StatusBadge, secondaryLink } from "@/components/app/ui";
import { siteConfig } from "@/config/site";
import { setShopEnabled } from "@/lib/actions/shop";
import { format } from "@/lib/i18n/format";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { DEFAULT_OPENING_HOURS, hasOpeningHours } from "@/lib/business/hours";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";
import { setModule } from "@/lib/actions/school";
import { MODULES, getBusinessModules } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = dashboardMetadata((d) => d.settings.title);

export default async function SettingsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/settings"));
  const d = t.dashboard;
  const s = d.settings;
  const countries: Record<string, string> = s.countries;
  const canEdit = canManageBusiness(business.role);
  const text = { errors: d.errors, saved: d.common.saved, saving: d.common.saving };
  const db = await createClient();
  const [{ data: receipt }, { data: wa }] = await Promise.all([
    db.from("businesses").select("receipt_footer, shop_enabled").eq("id", business.id).maybeSingle(),
    db.from("whatsapp_connections").select("status").eq("business_id", business.id).maybeSingle(),
  ]);
  const shopUrl = `${siteConfig.url.replace(/\/$/, "")}/s/${business.slug}`;
  const shopOn = !!receipt?.shop_enabled;
  const sh = s.shop;
  const modules = await getBusinessModules(business);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={s.title} />

      <Panel id="account" title={s.account.title} description={s.account.description}>
        <DefinitionList
          rows={[
            { label: s.account.name, value: user.fullName || "—" },
            { label: s.account.email, value: user.email },
          ]}
        />
      </Panel>

      <Panel id="interface" title={s.interface.title} description={s.interface.description}>
        <LanguageSwitcher persist />
      </Panel>

      <Panel id="modules" title={s.modules.title} description={s.modules.description}>
        <ul className="flex flex-col gap-3" data-testid="modules">
          {MODULES.map((m) => {
            const on = modules.includes(m);
            return (
              <li key={m} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-deep">
                    {s.modules.names[m]} <StatusBadge tone={on ? "green" : "neutral"}>{on ? s.modules.on : s.modules.off}</StatusBadge>
                  </p>
                  <p className="text-sm text-slate">{s.modules.texts[m]}</p>
                </div>
                {canEdit ? (
                  <ActionButton action={setModule.bind(null, m, !on)} errors={d.errors} variant={on ? "ghost" : "outline"}>
                    {on ? s.modules.turnOff : s.modules.turnOn}
                  </ActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate">{s.modules.note}</p>
      </Panel>

      <Panel id="business" title={d.business.title} description={d.business.description}>
        {!canEdit ? <FormAlert tone="info" className="mb-4">{d.common.readOnly}</FormAlert> : null}
        <BusinessProfileForm t={d.business} text={text} business={business} canEdit={canEdit} submitLabel={d.common.save} />
        <div className="mt-6 border-t border-border pt-4">
          <DefinitionList
            rows={[
              { label: s.business.role, value: d.header.roles[business.role] },
              { label: s.business.country, value: countries[business.countryCode] ?? business.countryCode },
              { label: s.business.currency, value: business.currency },
              { label: s.business.timezone, value: business.timezone },
              { label: s.business.replyLanguages, value: business.languages.map((l) => languageName(l, locale)).join(", ") },
              { label: s.business.defaultLanguage, value: languageName(business.defaultLanguage, locale) },
            ]}
          />
          <Link
            href={localizePath(locale, "/dashboard/ai/languages")}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-waza-700 hover:underline"
          >
            {s.business.manageLanguages} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Panel>

      <Panel id="shop" title={sh.title} description={sh.description}>
        <div className="flex flex-col gap-3" data-testid="shop-settings">
          <p className="flex items-center gap-2 text-sm font-semibold text-deep">
            <StatusBadge tone={shopOn ? "green" : "neutral"} dot>
              {shopOn ? sh.on : sh.off}
            </StatusBadge>
          </p>
          {shopOn ? (
            <>
              <p className="text-sm text-slate">
                {sh.link}: <CopyText value={shopUrl} label={sh.copy} copiedLabel={sh.copied} />
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={shopUrl} target="_blank" rel="noopener" className={secondaryLink}>
                  {sh.open}
                </a>
                <a href={`https://wa.me/?text=${encodeURIComponent(format(sh.shareText, { url: shopUrl }))}`} target="_blank" rel="noopener" className={secondaryLink}>
                  {sh.share}
                </a>
                {canEdit ? (
                  <ActionButton action={setShopEnabled.bind(null, false)} errors={d.errors} pendingLabel={d.common.saving} confirm={sh.offConfirm} variant="ghost">
                    {sh.turnOff}
                  </ActionButton>
                ) : null}
              </div>
              {wa?.status !== "connected" && !business.phone ? <FormAlert tone="info">{sh.noWhatsApp}</FormAlert> : null}
            </>
          ) : (
            <>
              <p className="text-sm text-slate">{sh.offText}</p>
              {canEdit ? (
                <div>
                  <ActionButton action={setShopEnabled.bind(null, true)} errors={d.errors} pendingLabel={d.common.saving} variant="default">
                    {sh.turnOn}
                  </ActionButton>
                </div>
              ) : (
                <p className="text-sm text-slate">{sh.ownersOnly}</p>
              )}
            </>
          )}
        </div>
      </Panel>

      <Panel id="receipts" title={s.receipts.title} description={s.receipts.description}>
        <ReceiptSettingsForm t={s.receipts} text={text} logoUrl={business.logoUrl} footer={receipt?.receipt_footer ?? null} canEdit={canEdit} submitLabel={d.common.save} />
      </Panel>

      <Panel id="hours" title={d.business.hours.title}>
        {!hasOpeningHours(business.openingHours) ? <FormAlert tone="info" className="mb-4">{d.business.hours.notSet}</FormAlert> : null}
        <OpeningHoursForm
          t={d.business}
          text={text}
          hours={hasOpeningHours(business.openingHours) ? business.openingHours : DEFAULT_OPENING_HOURS}
          timezone={business.timezone}
          canEdit={canEdit}
          submitLabel={d.common.save}
        />
      </Panel>

      <Panel id="security" title={s.password.title} description={s.password.description}>
        <div className="max-w-md">
          <ResetPasswordForm continueHref="/dashboard/settings" submitLabel={s.password.submit} />
        </div>
      </Panel>
    </div>
  );
}
