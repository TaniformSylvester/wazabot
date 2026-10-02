import { ActionButton } from "@/components/app/form";
import { InviteForm, LeaveBusiness, RemoveMember, RenewInvite, RoleSelect } from "@/components/app/team-controls";
import { PageHeader, Panel, StatusBadge, TableWrap, formatDate, td, th } from "@/components/app/ui";
import { revokeInvitation } from "@/lib/actions/team";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { listPendingInvitations, listTeam } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { ROLES, type BusinessRole } from "@/types/database";

export const generateMetadata = dashboardMetadata((d) => d.team.title);

/**
 * Team: members, roles and invitation links. Admins manage agents and
 * viewers; only the owner invites or manages admins (the database enforces
 * the same rules).
 */
export default async function TeamPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard/team"));
  const isAdmin = hasRole(business.role, "admin");
  const isOwner = business.role === "owner";
  const [members, invitations] = await Promise.all([listTeam(business.id), isAdmin ? listPendingInvitations(business.id) : []]);
  const d = t.dashboard;
  const tm = d.team;
  const roleLabel = (r: string) => d.header.roles[r as BusinessRole] ?? r;
  const assignable = (isOwner ? (["admin", "agent", "viewer"] as const) : (["agent", "viewer"] as const)).map((r) => ({ value: r, label: roleLabel(r) }));
  const canManage = (role: BusinessRole, userId: string) => isAdmin && userId !== user.id && role !== "owner" && (role !== "admin" || isOwner);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={tm.title} description={tm.description} />

      {isAdmin ? (
        <Panel title={tm.invite} description={tm.inviteText}>
          <InviteForm t={tm} errors={d.errors} roles={assignable} locale={locale} businessName={business.name} />
          {!isOwner ? <p className="mt-3 text-xs text-slate">{tm.ownerManagesAdmins}</p> : null}
        </Panel>
      ) : null}

      {isAdmin && invitations.length ? (
        <Panel title={tm.pending}>
          <ul className="divide-y divide-border">
            {invitations.map((inv) => {
              const manageable = inv.role !== "admin" || isOwner;
              return (
                <li key={inv.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-deep">{inv.email}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate">
                      <StatusBadge>{roleLabel(inv.role)}</StatusBadge>
                      {inv.expired ? <StatusBadge tone="red">{tm.expired}</StatusBadge> : <span>{format(tm.expires, { date: formatDate(inv.expires_at, locale) })}</span>}
                    </p>
                  </div>
                  {manageable ? (
                    <div className="flex flex-wrap items-start gap-2 sm:max-w-sm sm:justify-end">
                      <RenewInvite id={inv.id} email={inv.email} t={tm} errors={d.errors} locale={locale} businessName={business.name} />
                      <ActionButton action={revokeInvitation.bind(null, inv.id)} pendingLabel={tm.cancelling} errors={d.errors} variant="ghost">
                        {tm.cancelInvite}
                      </ActionButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <TableWrap>
          <thead>
            <tr>
              <th className={th}>{tm.columns.name}</th>
              <th className={th}>{tm.columns.email}</th>
              <th className={th}>{tm.columns.role}</th>
              <th className={th}>{tm.columns.since}</th>
              {isAdmin ? (
                <th className={th}>
                  <span className="sr-only">{tm.remove}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const name = m.profile?.full_name || m.profile?.email || "—";
              const manage = canManage(m.role, m.user_id);
              return (
                <tr key={m.user_id}>
                  <td className={td}>
                    <span className="font-semibold">{m.profile?.full_name || "—"}</span>{" "}
                    {m.user_id === user.id ? <StatusBadge tone="blue">{tm.you}</StatusBadge> : null}
                  </td>
                  <td className={`${td} text-slate`}>{m.profile?.email ?? "—"}</td>
                  <td className={td}>
                    {manage ? (
                      <RoleSelect userId={m.user_id} role={m.role} name={name} roles={assignable} t={tm} errors={d.errors} />
                    ) : (
                      <StatusBadge tone={m.role === "owner" ? "dark" : "neutral"}>{roleLabel(m.role)}</StatusBadge>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-slate`}>{formatDate(m.created_at, locale)}</td>
                  {isAdmin ? <td className={td}>{manage ? <RemoveMember userId={m.user_id} name={name} t={tm} errors={d.errors} cancel={d.common.cancel} /> : null}</td> : null}
                </tr>
              );
            })}
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

      {!isOwner ? (
        <div className="flex justify-start">
          <LeaveBusiness businessName={business.name} locale={locale} t={tm} errors={d.errors} cancel={d.common.cancel} />
        </div>
      ) : null}
    </div>
  );
}
