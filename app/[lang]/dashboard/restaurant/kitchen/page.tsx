import { ChefHat } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { ActionButton } from "@/components/app/form";
import { EmptyState, PageHeader, StatusBadge } from "@/components/app/ui";
import { moveTicket } from "@/lib/actions/restaurant";
import { requireBusiness } from "@/lib/auth/dal";
import { kitchenQueue } from "@/lib/data/restaurant";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { getBranchContext } from "@/lib/branches";
import { cn } from "@/lib/utils";

export const generateMetadata = dashboardMetadata((d) => d.restaurant.kitchen.title);
export const dynamic = "force-dynamic";

const NEXT = { new: "preparing", preparing: "ready", ready: "served" } as const;

/**
 * The kitchen screen (kitchen staff and any staff): open tickets, oldest
 * first — dishes, quantities, extras, notes and the table, never prices or
 * customers. Refreshes every few seconds; one tap moves a ticket on.
 */
export default async function KitchenPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  const { business } = await requireBusiness(localizePath(locale, "/dashboard/restaurant/kitchen"));
  const d = t.dashboard;
  const r = d.restaurant;
  const k = r.kitchen;
  const { tickets, at: now } = await kitchenQueue(business.id, (await getBranchContext(business)).current.id);
  const label = { new: k.start, preparing: k.ready, ready: k.served } as const;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={k.title} description={k.description} actions={<AutoRefresh seconds={8} label={format(k.updated, { time: new Date(now).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: business.timezone }) })} />} />
      {tickets === null ? (
        <FormAlert tone="error">{k.failed}</FormAlert>
      ) : tickets.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="kitchen-tickets">
          {tickets.map((ticket) => {
            const minutes = Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000));
            return (
              <li
                key={ticket.id}
                className={cn("flex flex-col gap-3 rounded-3xl border-2 bg-card p-5 shadow-card", ticket.status === "ready" ? "border-waza-500" : minutes >= 20 ? "border-coral-600" : "border-border")}
                data-testid="kitchen-ticket"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl font-bold text-deep">{ticket.table ? format(k.table, { name: ticket.table }) : r.serviceTypes[ticket.serviceType]}</p>
                    <p className="text-xs text-slate">
                      {ticket.orderNumber} · {format(k.round, { n: ticket.seq })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge tone={ticket.status === "ready" ? "green" : "amber"}>{r.ticketStatuses[ticket.status]}</StatusBadge>
                    <span className={cn("text-sm font-semibold", minutes >= 20 ? "text-coral-700" : "text-slate")}>{format(k.minutes, { min: minutes })}</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-2">
                  {ticket.items.map((item, i) => (
                    <li key={i} className="text-base">
                      <span className="font-bold text-deep">
                        {item.quantity} × {item.name}
                      </span>
                      {item.variant ? <span className="block text-sm text-slate">{item.variant}</span> : null}
                      {item.extras.length ? <span className="block text-sm font-semibold text-waza-700">+ {item.extras.join(", ")}</span> : null}
                      {item.note ? <span className="block text-sm text-coral-700 italic">“{item.note}”</span> : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  <ActionButton action={moveTicket.bind(null, ticket.id, NEXT[ticket.status])} errors={d.errors} variant={ticket.status === "ready" ? "outline" : "default"} size="default" className="w-full">
                    {label[ticket.status]}
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={ChefHat} title={k.empty} text={k.description} />
      )}
    </div>
  );
}
