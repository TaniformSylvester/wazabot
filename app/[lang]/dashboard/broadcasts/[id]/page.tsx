import { notFound } from "next/navigation";

import { ActionButton, DeleteButton } from "@/components/app/form";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PageHeader, Panel, StatusBadge, formatDate, type BadgeTone } from "@/components/app/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { deleteBroadcast, refreshBroadcastTemplate, resubmitBroadcastTemplate, resumeBroadcast, sendBroadcast } from "@/lib/actions/broadcasts";
import { isUuid } from "@/lib/actions/form";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { renderBroadcast } from "@/lib/broadcasts/compose";
import { countAudience, getBroadcast } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { languageName } from "@/lib/i18n/languages";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.broadcasts.title);

const RECIPIENT_TONE: Record<string, BadgeTone> = { pending: "neutral", sent: "green", failed: "red", skipped: "amber" };

export default async function BroadcastPage({ params }: PageProps<"/[lang]/dashboard/broadcasts/[id]">) {
  const [locale, t, { id }] = await Promise.all([getLocale(), getMessages(), params]);
  const { business } = await requireBusiness(localizePath(locale, `/dashboard/broadcasts/${id}`));
  const broadcast = isUuid(id) ? await getBroadcast(business.id, id) : null;
  if (!broadcast) notFound();
  const d = t.dashboard;
  const b = d.broadcasts;
  const x = b.detail;
  const canEdit = hasRole(business.role, "admin");
  const audience = await countAudience(business.id, broadcast.audience_tags, broadcast.audience_language);
  const preview = renderBroadcast(broadcast.body, "Brenda");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={broadcast.name}
        back={{ href: localizePath(locale, "/dashboard/broadcasts"), label: b.title }}
        actions={canEdit && broadcast.status === "draft" ? <DeleteButton action={deleteBroadcast.bind(null, broadcast.id, locale)} labels={{ ...d.common, delete: x.delete }} errors={d.errors} /> : null}
      />

      <Panel title={x.preview}>
        <div className="max-w-md rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm whitespace-pre-line text-deep">{preview}</div>
        <p className="mt-2 text-xs text-slate">{languageName(broadcast.language as "en" | "fr", locale)}</p>
      </Panel>

      <Panel title={x.review} actions={<StatusBadge tone={broadcast.template_status === "approved" ? "green" : broadcast.template_status === "pending" ? "amber" : broadcast.template_status === "rejected" || broadcast.template_status === "failed" ? "red" : "neutral"}>{b.template[broadcast.template_status as keyof typeof b.template] ?? broadcast.template_status}</StatusBadge>}>
        {broadcast.template_status === "pending" ? <p className="text-sm text-slate">{x.reviewPending}</p> : null}
        {broadcast.template_status === "rejected" ? <FormAlert tone="error">{format(x.reviewRejected, { reason: broadcast.template_reason ?? "—" })}</FormAlert> : null}
        {broadcast.template_status === "draft" || broadcast.template_status === "failed" ? (
          <p className="text-sm text-slate">
            {x.reviewNotSubmitted} {broadcast.template_reason ? <span className="text-coral-700">{broadcast.template_reason}</span> : null}
          </p>
        ) : null}
        {canEdit && broadcast.status === "draft" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {broadcast.template_status === "draft" || broadcast.template_status === "failed" ? (
              <ActionButton action={resubmitBroadcastTemplate.bind(null, broadcast.id)} errors={d.errors}>
                {x.resubmit}
              </ActionButton>
            ) : broadcast.template_status !== "approved" ? (
              <ActionButton action={refreshBroadcastTemplate.bind(null, broadcast.id)} pendingLabel={x.refreshing} errors={d.errors}>
                {x.refresh}
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel title={x.audience}>
        <p className="text-sm text-deep">{broadcast.audience_tags.length ? format(x.audienceTags, { tags: broadcast.audience_tags.join(", ") }) : x.audienceAll}{broadcast.audience_language ? ` · ${languageName(broadcast.audience_language as "en", locale)}` : ""}</p>
        {broadcast.status === "draft" ? <p className="mt-1 text-sm text-slate">{format(x.audienceNow, { count: formatNumber(audience, locale) })}</p> : null}
        {canEdit && broadcast.status === "draft" && broadcast.template_status === "approved" ? (
          <div className="mt-4 flex flex-col items-start gap-2">
            <ActionButton action={sendBroadcast.bind(null, broadcast.id)} pendingLabel={x.sending} errors={d.errors} variant="default" size="default">
              {format(x.send, { count: formatNumber(audience, locale) })}
            </ActionButton>
            <p className="text-xs text-slate">{x.sendHint}</p>
          </div>
        ) : null}
        {broadcast.status !== "draft" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge tone={broadcast.status === "sent" ? "green" : "amber"}>{b.status[broadcast.status as keyof typeof b.status]}</StatusBadge>
            <span className="text-sm text-deep">
              {format(x.progress, { sent: formatNumber(broadcast.sent_count, locale), total: formatNumber(broadcast.recipients_count, locale), failed: formatNumber(broadcast.failed_count, locale) })}
            </span>
            {broadcast.status === "sending" ? (
              <>
                {canEdit ? (
                  <ActionButton action={resumeBroadcast.bind(null, broadcast.id)} errors={d.errors}>
                    {x.resume}
                  </ActionButton>
                ) : null}
                <AutoRefresh label={d.conversations.live} />
              </>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {broadcast.recipients.length ? (
        <Panel title={x.recipients}>
          <ul className="divide-y divide-border">
            {broadcast.recipients.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-deep">{r.customers?.name || `+${r.customers?.whatsapp_phone ?? ""}`}</span>
                <StatusBadge tone={RECIPIENT_TONE[r.status] ?? "neutral"}>{x.recipientStatus[r.status as keyof typeof x.recipientStatus] ?? r.status}</StatusBadge>
                {r.sent_at ? <span className="text-xs text-slate">{formatDate(r.sent_at, locale, true)}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
