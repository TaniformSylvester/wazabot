import {
  BookOpen,
  ChartColumn,
  Hand,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/*
 * UI MOCKUP ONLY — illustrative example data for the marketing site.
 * Nothing here reads from the database.
 */

const metrics = [
  { label: "Conversations", value: "124", trend: "12%" },
  { label: "Customers", value: "83", trend: "8%" },
  { label: "Orders", value: "17", trend: "24%" },
  { label: "AI Resolution", value: "78%", trend: "6%" },
];

const conversations = [
  { name: "Sarah M.", message: "Do you have this dress in size L?", time: "10:24", mode: "ai", initials: "SM", tone: "bg-coral-100 text-[#a33117]" },
  { name: "Jean-Paul K.", message: "What are your opening hours on Sunday?", time: "10:12", mode: "ai", initials: "JK", tone: "bg-gold-100 text-[#7a5500]" },
  { name: "Aïcha B.", message: "I want a refund for my order", time: "09:58", mode: "human", initials: "AB", tone: "bg-waza-100 text-waza-900" },
  { name: "Marie T.", message: "Je veux passer une commande.", time: "09:47", mode: "ai", initials: "MT", tone: "bg-sky-100 text-sky-800" },
] as const;

const orders = [
  { ref: "#1042", item: "Robe en wax · L", amount: "15,000 XAF", status: "New" },
  { ref: "#1041", item: "Sac en cuir", amount: "22,500 XAF", status: "Confirmed" },
  { ref: "#1040", item: "Foulard ×2", amount: "8,000 XAF", status: "Delivered" },
];

const nav = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Conversations", icon: MessagesSquare, badge: "3" },
  { label: "Customers", icon: Users },
  { label: "Products", icon: Package },
  { label: "Orders", icon: ShoppingBag },
  { label: "Knowledge", icon: BookOpen },
  { label: "Analytics", icon: ChartColumn },
  { label: "Automations", icon: Workflow },
  { label: "Settings", icon: Settings },
];

export function AiOnlinePill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[0.6875rem] font-semibold text-waza-800",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-waza-400 opacity-60" />
        <span className="relative size-2 rounded-full bg-waza-500" />
      </span>
      AI Online
    </span>
  );
}

function MetricCard({ label, value, trend, compact }: (typeof metrics)[number] & { compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-white", compact ? "p-2.5" : "p-4")}>
      <p className={cn("text-slate-waza", compact ? "text-[0.625rem]" : "text-xs")}>{label}</p>
      <p className={cn("font-heading font-bold text-deep", compact ? "text-lg" : "text-2xl")}>{value}</p>
      <p className={cn("flex items-center gap-1 text-waza-700", compact ? "text-[0.5625rem]" : "text-[0.6875rem]")}>
        <TrendingUp className={compact ? "size-2.5" : "size-3"} aria-hidden /> {trend}
        {!compact ? <span className="text-slate-waza/80">vs yesterday</span> : null}
      </p>
    </div>
  );
}

function ConversationRow({ c }: { c: (typeof conversations)[number] }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", c.tone)}
        aria-hidden
      >
        {c.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-deep">{c.name}</p>
        <p className="truncate text-xs text-slate-waza">{c.message}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[0.6875rem] text-slate-waza/80">{c.time}</span>
        {c.mode === "ai" ? (
          <span className="rounded-full bg-mint px-2 py-0.5 text-[0.625rem] font-semibold text-waza-800">AI</span>
        ) : (
          <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[0.625rem] font-semibold text-[#a33117]">Human</span>
        )}
      </div>
    </li>
  );
}

/** Small dashboard card used inside the hero composition. */
export function DashboardMockCompact({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-white shadow-float", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <p className="font-heading text-sm font-bold text-deep">Good morning, MJ 👋</p>
          <p className="text-[0.625rem] text-slate-waza">Here&apos;s what&apos;s happening today.</p>
        </div>
        <AiOnlinePill />
      </div>
      <div className="grid grid-cols-4 gap-2 bg-[#fafcfb] p-3">
        {metrics.map((m) => (
          <MetricCard key={m.label} {...m} compact />
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-coral text-white">
          <Hand className="size-3" aria-hidden />
        </span>
        <p className="text-[0.6875rem] text-deep">
          <span className="font-semibold">1 chat handed to you</span>
          <span className="text-slate-waza"> · refund request</span>
        </p>
      </div>
    </div>
  );
}

/** Full dashboard preview for the "more than a chatbot" section. */
export function DashboardMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-white shadow-float",
        className,
      )}
    >
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-[#f6f8f7] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-coral/70" />
        <span className="size-2.5 rounded-full bg-gold" />
        <span className="size-2.5 rounded-full bg-waza-400" />
        <span className="ml-3 hidden rounded-md bg-white px-3 py-0.5 text-[0.6875rem] text-slate-waza sm:inline">
          app.wazabot.com/dashboard
        </span>
      </div>

      <div className="flex">
        <aside className="hidden w-52 shrink-0 border-r border-border p-4 md:block">
          <div className="mb-5 flex items-center gap-2">
            <LogoMark className="size-7" />
            <span className="font-heading text-base font-extrabold">
              <span className="text-deep">Waza</span>
              <span className="text-waza-600">Bot</span>
            </span>
          </div>
          <ul className="space-y-0.5">
            {nav.map(({ label, icon: Icon, active, badge }) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem]",
                  active ? "bg-mint font-semibold text-waza-800" : "text-slate-waza",
                  label === "Settings" && "mt-4",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {badge ? (
                  <span className="ml-auto rounded-full bg-waza-500 px-1.5 text-[0.625rem] font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 bg-[#fafcfb] p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-heading text-lg font-bold text-deep sm:text-xl">Good morning, MJ 👋</p>
              <p className="text-xs text-slate-waza sm:text-sm">MJ Fashion · Douala</p>
            </div>
            <div className="flex items-center gap-2">
              <AiOnlinePill />
              <span className="grid size-8 place-items-center rounded-full bg-deep text-[0.6875rem] font-bold text-white">
                MJ
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <MetricCard key={m.label} {...m} />
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-coral/30 bg-coral-100/60 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coral text-white">
              <Hand className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 text-xs sm:text-sm">
              <p className="font-semibold text-deep">Aïcha B. was handed to your team</p>
              <p className="text-slate-waza">Refund request — WazaBot paused and is waiting for you.</p>
            </div>
            <span className="ml-auto hidden shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-deep shadow-card sm:inline">
              Open chat
            </span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="min-w-0 rounded-xl border border-border bg-white p-4 lg:col-span-3">
              <p className="text-sm font-semibold text-deep">Recent conversations</p>
              <ul className="mt-1 divide-y divide-border">
                {conversations.map((c) => (
                  <ConversationRow key={c.name} c={c} />
                ))}
              </ul>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-white p-4 lg:col-span-2">
              <p className="text-sm font-semibold text-deep">Latest orders</p>
              <ul className="mt-1 divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.ref} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-deep">
                        {o.ref} <span className="font-normal text-slate-waza">· {o.item}</span>
                      </p>
                      <p className="text-xs text-slate-waza">{o.amount}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold",
                        o.status === "New" && "bg-gold-100 text-[#7a5500]",
                        o.status === "Confirmed" && "bg-sky-100 text-sky-800",
                        o.status === "Delivered" && "bg-mint text-waza-800",
                      )}
                    >
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
