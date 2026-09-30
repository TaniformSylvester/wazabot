import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, Panel, StatusBadge, TableWrap, formatDate, td, th } from "@/components/app/ui";
import { requireBusiness } from "@/lib/auth/dal";
import { listTeam } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import { ROLES } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.team.title);

export default async function TeamPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/team"));
  const members = await listTeam(business.id);
  const d = t.dashboard;
  const tm = d.team;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={tm.title}
        description={tm.description}
        actions={
          <Button type="button" variant="outline" size="sm" disabled title={tm.inviteSoon}>
            <UserPlus aria-hidden /> {tm.invite}
          </Button>
        }
      />
      <p className="-mt-3 text-xs text-slate">{tm.inviteSoon}</p>
      <Panel>
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>{tm.columns.name}</th>
              <th className={th}>{tm.columns.email}</th>
              <th className={th}>{tm.columns.role}</th>
              <th className={th}>{tm.columns.since}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td className={td}>
                  <span className="font-semibold">{m.profile?.full_name || "—"}</span>
                  {m.user_id === user.id ? <StatusBadge tone="blue">{tm.you}</StatusBadge> : null}
                </td>
                <td className={`${td} text-slate`}>{m.profile?.email ?? "—"}</td>
                <td className={td}>
                  <StatusBadge tone={m.role === "owner" ? "dark" : "neutral"}>{d.header.roles[m.role]}</StatusBadge>
                </td>
                <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(m.created_at, locale)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
      <Panel title={tm.columns.role}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <li key={r} className="rounded-2xl border border-border p-4">
              <p className="text-sm font-semibold text-deep">{d.header.roles[r]}</p>
              <p className="mt-0.5 text-xs text-slate">{tm.roles[r]}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
