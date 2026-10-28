import Link from "next/link";
import { Bike, ChefHat, LayoutGrid, ShoppingBag, Users } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { ActionButton, ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { EmptyState, PageHeader, Panel, StatusBadge, buttonLink, formatDate, formatMoney, secondaryLink } from "@/components/app/ui";
import { openBill } from "@/lib/actions/restaurant";
import { setModule } from "@/lib/actions/school";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { floorState } from "@/lib/data/restaurant";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { getBranchContext } from "@/lib/branches";
import { getBusinessModules } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.restaurant.floor.title);

/** The floor: every table (free, or its open bill), and takeaway/delivery orders in progress. Refreshes by itself. */
export default async function FloorPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/restaurant"));
  const d = t.dashboard;
  const r = d.restaurant;
  const f = r.floor;
  const href = (p: string) => localizePath(locale, p);
  const isAdmin = hasRole(business.role, "admin");
  const canOrder = hasRole(business.role, "agent");

  if (!(await getBusinessModules(business)).includes("restaurant")) {
    const m = d.settings.modules;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={f.title} description={f.description} />
        <Panel title={m.names.restaurant} description={m.texts.restaurant}>
          {isAdmin ? (
            <ActionButton action={setModule.bind(null, "restaurant", true)} errors={d.errors} variant="default">
              {m.turnOn}
            </ActionButton>
          ) : (
            <FormAlert tone="info">{m.note}</FormAlert>
          )}
        </Panel>
      </div>
    );
  }

  const { tables, others } = await floorState(business.id, (await getBranchContext(business)).current.id);
  const money = (v: number) => formatMoney(v, business.currency, locale);
  const time = (iso: string) => formatDate(iso, locale, true).split(" ").at(-1) ?? "";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={f.title}
        description={f.description}
        actions={
          <>
            <AutoRefresh seconds={15} />
            <Link href={href("/dashboard/restaurant/kitchen")} className={secondaryLink}>
              <ChefHat aria-hidden /> {r.kitchen.title}
            </Link>
            {canOrder ? (
              <>
                <Link href={href("/dashboard/restaurant/new?type=takeaway")} className={buttonLink} data-testid="new-takeaway">
                  <ShoppingBag aria-hidden /> {f.newTakeaway}
                </Link>
                <Link href={href("/dashboard/restaurant/new?type=delivery")} className={secondaryLink}>
                  <Bike aria-hidden /> {f.newDelivery}
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {!canOrder ? <FormAlert tone="info">{f.readOnly}</FormAlert> : null}

      {tables.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="floor-tables">
          {tables.map((table) => (
            <li key={table.id} className={cn("flex flex-col gap-3 rounded-3xl border p-5 shadow-card", table.bill ? "border-gold-200 bg-gold-50" : "border-border bg-card")} data-testid="floor-table">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-bold text-deep">{table.name}</p>
                  {table.area || table.seats ? (
                    <p className="flex items-center gap-1 text-xs text-slate">
                      {table.area}
                      {table.seats ? (
                        <>
                          <Users className="ml-1 size-3" aria-hidden /> {table.seats}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <StatusBadge tone={table.bill ? "amber" : "green"}>{table.bill ? f.busy : f.free}</StatusBadge>
              </div>
              {table.bill ? (
                <Link href={href(`/dashboard/restaurant/orders/${table.bill.id}`)} className="flex flex-col gap-0.5 rounded-2xl bg-card p-3 text-sm hover:ring-2 hover:ring-waza-500/30">
                  <span className="font-mono text-xs text-slate">{table.bill.order_number}</span>
                  <span className="font-display text-xl font-bold text-deep">{money(table.bill.total)}</span>
                  <span className="text-xs text-slate">
                    {format(f.opened, { time: time(table.bill.created_at) })} · {format(f.dishes, { count: table.bill.dishes })}
                    {table.bill.guests ? ` · ${table.bill.guests} ${f.guests.toLowerCase()}` : ""}
                  </span>
                  {table.bill.readyRounds ? <span className="text-xs font-semibold text-waza-700">{format(f.readyRounds, { count: table.bill.readyRounds })}</span> : null}
                </Link>
              ) : canOrder ? (
                <ActionForm action={openBill.bind(null, table.id, locale)} text={{ errors: d.errors, saved: d.common.saved, saving: d.common.saving }} successMessage={null} className="gap-3">
                  <TextField name="guests" label={f.guests} inputMode="numeric" defaultValue={table.seats ? String(table.seats) : ""} />
                  <div>
                    <SubmitButton>{f.openBill}</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={LayoutGrid}
          title={f.noTables}
          text={f.description}
          action={
            isAdmin ? (
              <Link href={href("/dashboard/restaurant/tables")} className={buttonLink}>
                {f.addTables}
              </Link>
            ) : undefined
          }
        />
      )}

      <Panel title={f.active}>
        {others.length ? (
          <ul className="divide-y divide-border" data-testid="floor-orders">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={href(`/dashboard/restaurant/orders/${o.id}`)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-surface">
                  <span className="flex flex-col">
                    <span className="font-semibold text-deep">
                      {o.order_number} · {r.serviceTypes[o.service_type]}
                      {o.customerName ? ` · ${o.customerName}` : ""}
                    </span>
                    <span className="text-xs text-slate">
                      {format(f.dishes, { count: o.dishes })} · {time(o.created_at)}
                      {o.channel === "whatsapp" && o.status === "pending" ? ` · ${f.fromWhatsApp}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={o.status === "ready" ? "green" : o.status === "pending" ? "amber" : "neutral"}>{d.orders.statuses[o.status as keyof typeof d.orders.statuses] ?? o.status}</StatusBadge>
                    <span className="font-semibold whitespace-nowrap">{money(o.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">{f.noActive}</p>
        )}
      </Panel>
    </div>
  );
}
