import { ActionButton, ActionForm, CheckboxField, SubmitButton } from "@/components/app/form";
import { FormAlert } from "@/components/auth/form-alert";
import { LinkTabs, PageHeader, Panel, StatusBadge, TableWrap, formatDate, td, th, type BadgeTone } from "@/components/app/ui";
import { saveNotificationSettings, submitTemplatesAction, syncTemplatesAction } from "@/lib/actions/notifications";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getNotificationSetup, getWhatsAppConnection } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { NOTIFICATION_KINDS, TEMPLATE_LANGUAGES } from "@/lib/notifications/templates";

export const generateMetadata = dashboardMetadata((d) => d.notifications.title);

const TEMPLATE_TONE: Record<string, BadgeTone> = { approved: "green", pending: "amber", rejected: "red", paused: "amber", disabled: "red", failed: "red" };
const LOG_TONE: Record<string, BadgeTone> = { sent: "green", failed: "red", skipped: "neutral" };

/** WhatsApp → Notifications: what's sent automatically, the Meta templates it needs, and what went out. */
export default async function NotificationsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/whatsapp/notifications"));
  const [{ settings, templates, log }, conn] = await Promise.all([getNotificationSetup(business.id), getWhatsAppConnection(business.id)]);
  const d = t.dashboard;
  const n = d.notifications;
  const href = (p: string) => localizePath(locale, p);
  const canEdit = hasRole(business.role, "admin");
  const connected = conn?.status === "connected";
  const byKey = new Map(templates.map((tp) => [`${tp.kind}:${tp.language}`, tp]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={d.whatsapp.title} description={n.description} />
      <LinkTabs
        active="notifications"
        tabs={[
          { key: "connection", label: n.tabs.connection, href: href("/dashboard/whatsapp") },
          { key: "notifications", label: n.tabs.notifications, href: href("/dashboard/whatsapp/notifications") },
        ]}
      />
      <FormAlert tone="info">{n.rule}</FormAlert>

      <Panel title={n.settings.title}>
        <ActionForm action={saveNotificationSettings} text={{ errors: d.errors, saved: n.settings.saved, saving: d.common.saving }} disabled={!canEdit} successMessage={n.settings.saved}>
          <CheckboxField name="order_updates" label={n.settings.orderUpdates} description={n.settings.orderUpdatesText} defaultChecked={settings?.order_updates ?? true} />
          <CheckboxField name="appointment_updates" label={n.settings.appointmentUpdates} description={n.settings.appointmentUpdatesText} defaultChecked={settings?.appointment_updates ?? true} />
          <CheckboxField name="appointment_reminders" label={n.settings.reminders} description={n.settings.remindersText} defaultChecked={settings?.appointment_reminders ?? true} />
          <div>
            <SubmitButton>{d.common.save}</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title={n.templates.title}
        actions={
          canEdit && connected ? (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={submitTemplatesAction} pendingLabel={n.templates.submitting} errors={d.errors} variant="default">
                {n.templates.submit}
              </ActionButton>
              {templates.length ? (
                <ActionButton action={syncTemplatesAction} pendingLabel={n.templates.refreshing} errors={d.errors}>
                  {n.templates.refresh}
                </ActionButton>
              ) : null}
            </div>
          ) : null
        }
      >
        {!connected ? <p className="mb-4 text-sm text-slate">{n.templates.notConnected}</p> : null}
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>{n.templates.columns.message}</th>
              {TEMPLATE_LANGUAGES.map((l) => (
                <th key={l} className={th}>
                  {n.templates.languages[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_KINDS.map((kind) => (
              <tr key={kind}>
                <td className={`${td} font-semibold`}>{n.templates.kinds[kind]}</td>
                {TEMPLATE_LANGUAGES.map((l) => {
                  const tp = byKey.get(`${kind}:${l}`);
                  return (
                    <td key={l} className={td}>
                      {tp ? (
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge tone={TEMPLATE_TONE[tp.status] ?? "neutral"}>{n.templates.status[tp.status as keyof typeof n.templates.status] ?? tp.status}</StatusBadge>
                          {tp.rejected_reason ? <span className="max-w-56 text-xs text-coral-700">{tp.rejected_reason}</span> : null}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title={n.log.title}>
        {log.length === 0 ? (
          <p className="text-sm text-slate">{n.log.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="font-semibold text-deep">{n.templates.kinds[row.kind as keyof typeof n.templates.kinds] ?? row.kind}</span>
                <span className="text-slate">{row.customers?.name || row.customers?.whatsapp_phone}</span>
                <StatusBadge tone={LOG_TONE[row.status] ?? "neutral"}>{n.log.status[row.status as keyof typeof n.log.status] ?? row.status}</StatusBadge>
                <span className="text-xs text-slate">
                  {row.status === "sent" && row.channel ? n.log.channel[row.channel as keyof typeof n.log.channel] : row.reason ? (n.log.reasons[row.reason as keyof typeof n.log.reasons] ?? row.reason) : null}
                </span>
                <span className="ml-auto text-xs text-slate">{formatDate(row.created_at, locale, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
