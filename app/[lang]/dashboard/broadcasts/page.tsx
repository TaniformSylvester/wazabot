import Link from "next/link";
import { Megaphone } from "lucide-react";

import { EmptyState, PageHeader, Panel, StatusBadge, TableWrap, formatDate, td, th, type BadgeTone } from "@/components/app/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { countAudience, listBroadcasts } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.broadcasts.title);

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", sending: "amber", sent: "green", cancelled: "red" };
const TEMPLATE_TONE: Record<string, BadgeTone> = { draft: "neutral", pending: "amber", approved: "green", rejected: "red", paused: "amber", disabled: "red", failed: "red" };

/** Broadcasts: promotions to customers who opted in. */
export default async function BroadcastsPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/broadcasts"));
  const [broadcasts, subscribers] = await Promise.all([listBroadcasts(business.id), countAudience(business.id, [], null)]);
  const d = t.dashboard;
  const b = d.broadcasts;
  const href = (p: string) => localizePath(locale, p);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={b.title}
        description={b.description}
        actions={
          hasRole(business.role, "admin") ? (
            <Button asChild>
              <Link href={href("/dashboard/broadcasts/new")}>
                <Megaphone aria-hidden />
                <span>{b.new}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <Panel>
        <p className="font-display text-lg font-bold text-deep">{format(b.subscribers, { count: formatNumber(subscribers, locale) })}</p>
        <p className="mt-1 text-sm text-slate">{b.subscribersHint}</p>
      </Panel>
      <FormAlert tone="info">{b.cost}</FormAlert>
      {broadcasts.length === 0 ? (
        <EmptyState icon={Megaphone} title={d.common.noDataYet} text={b.empty} />
      ) : (
        <Panel>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>{b.columns.name}</th>
                <th className={th}>{b.columns.template}</th>
                <th className={th}>{b.columns.status}</th>
                <th className={th}>{b.columns.results}</th>
                <th className={th}>{b.columns.date}</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((x) => (
                <tr key={x.id}>
                  <td className={td}>
                    <Link href={href(`/dashboard/broadcasts/${x.id}`)} className="font-semibold text-deep hover:underline">
                      {x.name}
                    </Link>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={TEMPLATE_TONE[x.template_status] ?? "neutral"}>{b.template[x.template_status as keyof typeof b.template] ?? x.template_status}</StatusBadge>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={STATUS_TONE[x.status] ?? "neutral"}>{b.status[x.status as keyof typeof b.status] ?? x.status}</StatusBadge>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{x.status === "draft" ? "—" : format(b.results, { sent: formatNumber(x.sent_count, locale), total: formatNumber(x.recipients_count, locale) })}</td>
                  <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(x.created_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      )}
    </div>
  );
}
