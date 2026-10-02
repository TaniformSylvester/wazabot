import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, CheckboxField, RadioCards, SubmitButton, TextArea } from "@/components/app/form";
import { LinkTabs, PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { saveAiSettings } from "@/lib/actions/ai";
import { canManageBusiness, hasRole, requireBusiness } from "@/lib/auth/dal";
import { getAiSettingsRow, getAiUsageSummary, getWhatsAppConnection } from "@/lib/data/queries";
import { aiConfigured } from "@/lib/ai/claude";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";
import { AFTER_HOURS_MODES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.ai.title);

/** AI Assistant → General. Saved to ai_settings; no model is called in this stage. */
export default async function AiAssistantPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/ai"));
  const [settings, connection, usage] = await Promise.all([getAiSettingsRow(business.id), getWhatsAppConnection(business.id), getAiUsageSummary(business.id)]);
  const d = t.dashboard;
  const a = d.ai;
  const canEdit = canManageBusiness(business.role);
  const text = { errors: d.errors, saved: a.saved, saving: d.common.saving };
  const liveState = !aiConfigured() ? "noKey" : connection?.status !== "connected" ? "noWhatsapp" : settings?.ai_enabled === false ? "off" : "live";
  const mode = settings?.language_mode === "fixed" ? languageName(business.defaultLanguage, locale) : a.language.automatic;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={a.title} description={a.description} />
      <LinkTabs
        active="general"
        tabs={[
          { key: "general", label: a.tabs.general, href: localizePath(locale, "/dashboard/ai") },
          { key: "languages", label: a.tabs.languages, href: localizePath(locale, "/dashboard/ai/languages") },
          ...(hasRole(business.role, "agent") ? [{ key: "test", label: a.tabs.test, href: localizePath(locale, "/dashboard/ai/test") }] : []),
        ]}
      />
      <Panel title={a.status.title}>
        <div className="flex flex-col gap-4">
          <StatusBadge tone={liveState === "live" ? "green" : liveState === "off" ? "neutral" : "amber"} dot wrap>
            {a.status[liveState]}
          </StatusBadge>
          <p className="text-xs text-slate">{a.status.humanNote}</p>
          {canEdit ? (
            usage.replies + usage.handovers + usage.failed ? (
              <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                {(["replies", "handovers", "failed"] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-xs text-slate">{a.usage[k]}</dt>
                    <dd className="font-display text-xl font-bold text-deep">{usage[k]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="border-t border-border pt-4 text-sm text-slate">{a.usage.none}</p>
            )
          ) : null}
        </div>
      </Panel>
      {!canEdit ? <FormAlert tone="info">{d.common.readOnly}</FormAlert> : null}

      {settings ? (
        <ActionForm action={saveAiSettings} text={text} disabled={!canEdit}>
          <Panel>
            <CheckboxField name="ai_enabled" label={a.enabled.label} description={a.enabled.on} defaultChecked={settings.ai_enabled} />
          </Panel>

          <Panel className="flex flex-col gap-6">
            <RadioCards
              name="tone"
              label={a.personality.label}
              defaultValue={settings.tone}
              options={(["professional", "friendly", "casual"] as const).map((v) => ({ value: v, label: a.personality[v] }))}
            />
            <RadioCards
              name="reply_length"
              label={a.length.label}
              defaultValue={settings.reply_length}
              options={(["short", "medium", "detailed"] as const).map((v) => ({ value: v, label: a.length[v] }))}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-deep">{a.language.label}</p>
                <p className="text-xs text-slate">{a.language.text}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge tone="blue">{mode}</StatusBadge>
                <Link href={localizePath(locale, "/dashboard/ai/languages")} className="inline-flex items-center gap-1 text-sm font-semibold text-waza-700 hover:underline">
                  {a.language.manage} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-5">
            <TextArea name="greeting" label={a.greeting.label} hint={a.greeting.help} placeholder={a.greeting.placeholder} defaultValue={settings.greeting ?? ""} maxLength={1000} rows={2} />
            <TextArea name="fallback_message" label={a.fallback.label} hint={a.fallback.help} placeholder={a.fallback.placeholder} defaultValue={settings.fallback_message ?? ""} maxLength={1000} rows={2} />
          </Panel>

          <Panel className="flex flex-col gap-5">
            <RadioCards
              name="after_hours_mode"
              label={a.afterHours.label}
              defaultValue={settings.after_hours_mode}
              options={AFTER_HOURS_MODES.map((m) => ({ value: m, label: a.afterHours[m] }))}
            />
            <TextArea
              name="after_hours_message"
              label={a.afterHours.message}
              placeholder={a.afterHours.placeholder}
              defaultValue={settings.after_hours_message ?? ""}
              maxLength={1000}
              rows={2}
            />
          </Panel>

          <Panel className="grid gap-3 sm:grid-cols-2">
            <CheckboxField name="human_handover_enabled" label={a.handover.label} description={a.handover.text} defaultChecked={settings.human_handover_enabled} />
            <CheckboxField name="sales_mode" label={a.sales.label} description={a.sales.text} defaultChecked={settings.sales_mode} />
            <CheckboxField name="photo_understanding" label={a.photos.label} description={a.photos.text} defaultChecked={settings.photo_understanding} />
          </Panel>

          <div>
            <SubmitButton>{d.common.save}</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <FormAlert tone="error">{d.errors.not_found}</FormAlert>
      )}
    </div>
  );
}
