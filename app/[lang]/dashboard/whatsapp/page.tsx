import { CircleAlert, CircleCheck, Loader2, Smartphone } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { ActionForm, DeleteButton, SubmitButton, TextField } from "@/components/app/form";
import { DefinitionList, LinkTabs, PageHeader, Panel, StatusBadge, formatDate, type BadgeTone } from "@/components/app/ui";
import { connectWhatsAppAction, disconnectWhatsAppAction } from "@/lib/actions/whatsapp";
import { canManageBusiness, requireBusiness } from "@/lib/auth/dal";
import { getWhatsAppConnection } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { storedTokenHint } from "@/lib/whatsapp/connection";
import { webhookUrl, whatsappPlatformReadiness } from "@/lib/whatsapp/service";

export const generateMetadata = dashboardMetadata((d) => d.whatsapp.title);

const STATUS_UI: Record<string, { tone: BadgeTone; icon: typeof Smartphone }> = {
  not_connected: { tone: "neutral", icon: Smartphone },
  connecting: { tone: "amber", icon: Loader2 },
  connected: { tone: "green", icon: CircleCheck },
  error: { tone: "red", icon: CircleAlert },
};

/** Real connection state from whatsapp_connections; "connected" only after Meta confirmed the number. */
export default async function WhatsAppPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/whatsapp"));
  const [conn, hint] = await Promise.all([getWhatsAppConnection(business.id), storedTokenHint(business.id)]);
  const d = t.dashboard;
  const w = d.whatsapp;
  const status = conn?.status ?? "not_connected";
  const ui = STATUS_UI[status];
  const none = d.common.notSet;
  const canEdit = canManageBusiness(business.role);
  const readiness = whatsappPlatformReadiness();
  const platformReady = Object.values(readiness).every(Boolean);
  const text = { errors: d.errors, saved: w.connected, saving: d.common.saving };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={w.title} description={w.description} />
      <LinkTabs
        active="connection"
        tabs={[
          { key: "connection", label: d.notifications.tabs.connection, href: localizePath(locale, "/dashboard/whatsapp") },
          { key: "notifications", label: d.notifications.tabs.notifications, href: localizePath(locale, "/dashboard/whatsapp/notifications") },
        ]}
      />
      <Panel title={w.status}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-surface text-deep">
                <ui.icon className="size-5" aria-hidden />
              </span>
              <StatusBadge tone={ui.tone} dot>
                {w.statuses[status]}
              </StatusBadge>
            </div>
            {status === "connected" && canEdit ? (
              <DeleteButton
                action={disconnectWhatsAppAction}
                labels={{ delete: w.disconnect, deleting: w.disconnecting, confirmDelete: w.confirmDisconnect, confirm: w.disconnect, cancel: d.common.cancel }}
                errors={d.errors}
              />
            ) : null}
          </div>
          <DefinitionList
            rows={[
              { label: w.fields.phone, value: conn?.display_phone_number ?? none },
              { label: w.fields.verifiedName, value: conn?.verified_name ?? none },
              { label: w.fields.waba, value: conn?.waba_id ?? none },
              { label: w.fields.phoneNumberId, value: conn?.phone_number_id ?? none },
              { label: w.fields.connectedAt, value: conn?.connected_at ? formatDate(conn.connected_at, locale, true) : none },
            ]}
          />
          {status === "connected" && hint ? <p className="text-xs text-slate">{format(w.tokenStored, { hint: `…${hint}` })}</p> : null}
          {status === "error" && conn?.last_error ? (
            <FormAlert tone="error">
              <span className="font-semibold">{w.lastError}:</span> {conn.last_error}
            </FormAlert>
          ) : null}
        </div>
      </Panel>

      {status !== "connected" ? (
        <Panel title={w.form.title} description={w.form.text}>
          {!canEdit ? <FormAlert tone="info">{w.readOnly}</FormAlert> : null}
          {canEdit && !platformReady ? <FormAlert tone="info">{w.notConfigured}</FormAlert> : null}
          {canEdit && platformReady ? (
            <ActionForm action={connectWhatsAppAction} text={text} resetOnSuccess>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField name="phone_number_id" label={w.form.phoneNumberId} hint={w.form.phoneNumberIdHint} inputMode="numeric" autoComplete="off" required defaultValue={conn?.phone_number_id ?? ""} />
                <TextField name="waba_id" label={w.form.wabaId} inputMode="numeric" autoComplete="off" required defaultValue={conn?.waba_id ?? ""} />
                <TextField name="access_token" label={w.form.accessToken} hint={w.form.accessTokenHint} type="password" autoComplete="off" required className="sm:col-span-2" />
              </div>
              <div>
                <SubmitButton>
                  <Smartphone aria-hidden /> {w.connect}
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </Panel>
      ) : (
        <p className="text-xs text-slate">{w.form.replaceToken}</p>
      )}

      <Panel title={w.steps.title}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-deep">
          {w.steps.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      {canEdit ? (
        <Panel title={w.webhook.title} description={w.webhook.text}>
          <DefinitionList
            rows={[
              { label: w.webhook.url, value: <code className="break-all rounded bg-surface px-1.5 py-0.5 text-xs">{webhookUrl()}</code> },
              {
                label: w.webhook.ready,
                value: <StatusBadge tone={platformReady ? "green" : "amber"}>{platformReady ? w.webhook.ok : w.webhook.missing}</StatusBadge>,
              },
            ]}
          />
        </Panel>
      ) : null}
    </div>
  );
}
