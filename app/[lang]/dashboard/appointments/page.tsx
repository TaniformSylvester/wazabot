import Link from "next/link";
import { CalendarPlus } from "lucide-react";

import { AppointmentActions } from "@/components/app/appointment-actions";
import { EmptyState, LinkTabs, PageHeader, Panel, StatusBadge, formatMoney, param, type BadgeTone } from "@/components/app/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { localDate } from "@/lib/business/time";
import { getBookingSetup, listAppointmentWindow } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.appointments.title);

const STATUS_TONE: Record<string, BadgeTone> = { booked: "blue", confirmed: "green", completed: "neutral", cancelled: "red", no_show: "amber" };

/** Appointments → Calendar: the next 30 days (or the past 30), grouped by local day. */
export default async function AppointmentsPage({ searchParams }: PageProps<"/[lang]/dashboard/appointments">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/appointments"));
  const view = param(sp.view) === "past" ? "past" : "upcoming";
  const [{ settings, services }, appointments] = await Promise.all([getBookingSetup(business.id), listAppointmentWindow(business.id, view)]);
  const d = t.dashboard;
  const a = d.appointments;
  const href = (p: string) => localizePath(locale, p);
  const tz = business.timezone;
  const canBook = hasRole(business.role, "agent") && settings?.enabled && services.some((s) => s.active);
  const isAdmin = hasRole(business.role, "admin");

  const dayLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const timeLabel = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const groups = new Map<string, typeof appointments>();
  for (const appt of appointments) {
    const key = localDate(new Date(appt.starts_at), tz);
    groups.set(key, [...(groups.get(key) ?? []), appt]);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={a.title}
        description={a.description}
        actions={
          canBook ? (
            <Button asChild>
              <Link href={href("/dashboard/appointments/new")}>
                <CalendarPlus aria-hidden />
                <span>{a.new}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <LinkTabs
        active="calendar"
        tabs={[
          { key: "calendar", label: a.tabs.calendar, href: href("/dashboard/appointments") },
          { key: "setup", label: a.tabs.setup, href: href("/dashboard/appointments/setup") },
        ]}
      />
      {sp.booked ? <FormAlert tone="success">{a.booked}</FormAlert> : null}
      {!settings?.enabled ? <FormAlert tone="info">{isAdmin ? a.off : a.offAgent}</FormAlert> : !services.some((s) => s.active) ? <FormAlert tone="info">{a.noServices}</FormAlert> : null}

      <div className="flex gap-2">
        <Button asChild size="sm" variant={view === "upcoming" ? "dark" : "outline"}>
          <Link href={href("/dashboard/appointments")} aria-current={view === "upcoming" ? "page" : undefined}>
            {a.upcoming}
          </Link>
        </Button>
        <Button asChild size="sm" variant={view === "past" ? "dark" : "outline"}>
          <Link href={href("/dashboard/appointments?view=past")} aria-current={view === "past" ? "page" : undefined}>
            {a.past}
          </Link>
        </Button>
      </div>

      {groups.size === 0 ? (
        <EmptyState icon={CalendarPlus} title={d.common.noDataYet} text={a.empty} />
      ) : (
        [...groups.entries()].map(([day, items]) => (
          <Panel key={day} title={dayLabel.format(new Date(items[0].starts_at))}>
            <ul className="divide-y divide-border">
              {items.map((appt) => {
                const past = appt.ended;
                return (
                  <li key={appt.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                    <div className="w-28 shrink-0 font-display text-base font-bold text-deep">
                      {timeLabel.format(new Date(appt.starts_at))}–{timeLabel.format(new Date(appt.ends_at))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-deep">
                        {appt.service_name}
                        {appt.price !== null ? <span className="font-normal text-slate"> · {formatMoney(appt.price, appt.currency, locale)}</span> : null}
                      </p>
                      <p className="truncate text-xs text-slate">
                        <Link href={href(`/dashboard/customers/${appt.customer_id}`)} className="font-semibold text-waza-700 hover:underline">
                          {appt.customers?.name || appt.customers?.whatsapp_phone}
                        </Link>
                        {appt.conversation_id ? ` · ${a.viaAssistant}` : null}
                        {appt.notes ? ` · ${appt.notes}` : null}
                      </p>
                    </div>
                    <StatusBadge tone={STATUS_TONE[appt.status] ?? "neutral"}>{a.status[appt.status as keyof typeof a.status] ?? appt.status}</StatusBadge>
                    {hasRole(business.role, "agent") ? <AppointmentActions id={appt.id} status={appt.status} past={past} t={a} errors={d.errors} /> : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}
