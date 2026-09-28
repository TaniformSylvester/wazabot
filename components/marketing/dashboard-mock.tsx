import {
  BookOpen,
  CalendarClock,
  ChartColumn,
  Hand,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { CountUp } from "@/components/motion/count-up";
import { tones } from "@/config/solutions";
import { cn } from "@/lib/utils";

/*
 * UI MOCKUP ONLY — illustrative example data for the marketing site.
 * Nothing here reads from the database.
 */

const metrics = [
  { label: "Conversations", value: 124, suffix: "", trend: "12%" },
  { label: "Customers", value: 83, suffix: "", trend: "8%" },
  { label: "Orders", value: 17, suffix: "", trend: "24%" },
  { label: "Handled by AI", value: 78, suffix: "%", trend: "6%" },
];

const conversations = [
  { name: "Sarah M.", message: "Do you have this dress in size L?", time: "10:24", mode: "ai", initials: "SM", tone: "volt" },
  { name: "Jean-Paul K.", message: "What are your opening hours on Sunday?", time: "10:12", mode: "ai", initials: "JK", tone: "bolt" },
  { name: "Aïcha B.", message: "I want a refund for my order", time: "09:58", mode: "human", initials: "AB", tone: "ember" },
  { name: "Marie T.", message: "Je veux passer une commande.", time: "09:47", mode: "ai", initials: "MT", tone: "sand" },
] as const;

const orders = [
  { ref: "#1042", item: "Robe en wax · L", amount: "15,000 XAF", status: "New" },
  { ref: "#1041", item: "Sac en cuir", amount: "22,500 XAF", status: "Confirmed" },
  { ref: "#1040", item: "Foulard ×2", amount: "8,000 XAF", status: "Delivered" },
] as const;

const statusStyle = {
  New: "bg-ember-100 text-ember-700",
  Confirmed: "bg-volt-100 text-volt-700",
  Delivered: "bg-success-bg text-success",
} as const;

const nav = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Conversations", icon: MessagesSquare, badge: "3" },
  { label: "Customers", icon: Users },
  { label: "Catalog", icon: Package },
  { label: "Orders", icon: ShoppingBag },
  { label: "Appointments", icon: CalendarClock },
  { label: "Broadcasts", icon: Megaphone },
  { label: "Knowledge", icon: BookOpen },
  { label: "Analytics", icon: ChartColumn },
  { label: "Settings", icon: Settings },
];

export function AutomationPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-semibold text-bolt-400",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-bolt-400 opacity-60" />
        <span className="relative size-2 rounded-full bg-bolt-500" />
      </span>
      Automation on
    </span>
  );
}

/** Full dashboard preview for the "more than a chatbot" section. */
export function DashboardMock({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-border bg-card shadow-float", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-sand-100 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-sand-300" />
        <span className="size-2.5 rounded-full bg-sand-300" />
        <span className="size-2.5 rounded-full bg-sand-300" />
        <span className="ml-3 hidden rounded-md bg-card px-3 py-0.5 text-[0.6875rem] text-stone sm:inline">
          app.wazabolt.com/dashboard
        </span>
      </div>

      <div className="flex">
        <aside className="hidden w-52 shrink-0 bg-ink p-4 md:block">
          <Logo tone="dark" size="sm" className="mb-6" />
          <ul className="space-y-0.5">
            {nav.map(({ label, icon: Icon, active, badge }) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem]",
                  active ? "bg-bolt-500 font-semibold text-ink" : "text-sand/70",
                  label === "Settings" && "mt-4",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {badge ? (
                  <span className="ml-auto rounded-full bg-ember-500 px-1.5 text-[0.625rem] font-bold text-ink">
                    {badge}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 bg-sand p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold text-ink sm:text-xl">Good morning, MJ</p>
              <p className="text-xs text-stone sm:text-sm">MJ Fashion · Douala</p>
            </div>
            <div className="flex items-center gap-2">
              <AutomationPill />
              <span className="grid size-8 place-items-center rounded-full bg-bolt-500 text-[0.6875rem] font-bold text-ink">
                MJ
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-stone">{m.label}</p>
                <p className="font-display text-2xl font-bold text-ink">
                  <CountUp value={m.value} suffix={m.suffix} />
                </p>
                <p className="flex items-center gap-1 text-[0.6875rem] font-medium text-success">
                  <TrendingUp className="size-3" aria-hidden /> {m.trend}
                  <span className="font-normal text-stone">vs yesterday</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-ember-200 bg-ember-50 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ember-500 text-ink">
              <Hand className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 text-xs sm:text-sm">
              <p className="font-semibold text-ink">Aïcha B. was handed to your team</p>
              <p className="text-stone">Refund request — automation paused and waiting for you.</p>
            </div>
            <span className="ml-auto hidden shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-sand sm:inline">
              Open chat
            </span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="min-w-0 rounded-xl border border-border bg-card p-4 lg:col-span-3">
              <p className="text-sm font-semibold text-ink">Recent conversations</p>
              <ul className="mt-1 divide-y divide-border">
                {conversations.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 py-2.5">
                    <span
                      className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", tones[c.tone])}
                      aria-hidden
                    >
                      {c.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="truncate text-xs text-stone">{c.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[0.6875rem] text-stone">{c.time}</span>
                      {c.mode === "ai" ? (
                        <span className="rounded-full bg-ink px-2 py-0.5 text-[0.625rem] font-semibold text-bolt-400">AI</span>
                      ) : (
                        <span className="rounded-full bg-ember-100 px-2 py-0.5 text-[0.625rem] font-semibold text-ember-700">Human</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-card p-4 lg:col-span-2">
              <p className="text-sm font-semibold text-ink">Latest orders</p>
              <ul className="mt-1 divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.ref} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {o.ref} <span className="font-normal text-stone">· {o.item}</span>
                      </p>
                      <p className="text-xs text-stone">{o.amount}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold", statusStyle[o.status])}>
                      {o.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
