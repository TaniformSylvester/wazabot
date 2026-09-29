import Image from "next/image";
import {
  Bot,
  BookOpen,
  ChartColumn,
  CreditCard,
  Hand,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";

import { AIStatus } from "@/components/brand/ai-status";
import { WazaBoltLogo } from "@/components/brand/logo";
import { CountUp } from "@/components/motion/count-up";
import { iconTones } from "@/lib/brand/tones";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatXaf } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

/*
 * UI MOCKUP ONLY — illustrative example data for the marketing site.
 * Nothing here reads from the database.
 */

const metrics = [
  { key: "conversations", value: 124, suffix: "", trend: "12%" },
  { key: "customers", value: 83, suffix: "", trend: "8%" },
  { key: "orders", value: 17, suffix: "", trend: "24%" },
  { key: "resolution", value: 78, suffix: "%", trend: "6%" },
] as const;

/** Example conversations — texts come from the dictionary (index-aligned). */
const conversations = [
  { time: "10:24", mode: "ai", initials: "SM", tone: "green" },
  { time: "10:12", mode: "ai", initials: "JK", tone: "gold" },
  { time: "09:58", mode: "human", initials: "AB", tone: "coral" },
  { time: "09:47", mode: "ai", initials: "MT", tone: "teal" },
] as const;

const orders = [
  { ref: "#1042", item: "Robe en wax · L", amount: 15_000, status: "new" },
  { ref: "#1041", item: "Sac en cuir", amount: 22_500, status: "confirmed" },
  { ref: "#1040", item: "Foulard ×2", amount: 8_000, status: "delivered" },
] as const;

const products = [
  { name: "Robe en wax", price: 15_000, asked: 18 },
  { name: "Sac en cuir", price: 22_500, asked: 11 },
  { name: "Foulard imprimé", price: 4_000, asked: 7 },
];

const newCustomers = [
  { name: "Sarah M.", city: "Douala", initials: "SM" },
  { name: "Brice N.", city: "Yaoundé", initials: "BN" },
  { name: "Clarisse E.", city: "Buea", initials: "CE" },
];

const statusStyle = {
  new: "bg-gold-100 text-gold-800",
  confirmed: "bg-waza-100 text-waza-900",
  delivered: "bg-mint text-waza-700",
} as const;

type NavItemKey = keyof Messages["dashboardMock"]["nav"]["items"];
const navGroups: { key: keyof Messages["dashboardMock"]["nav"]["groups"]; items: { key: NavItemKey; icon: typeof Bot; active?: true; badge?: string }[] }[] = [
  { key: "main", items: [{ key: "dashboard", icon: LayoutDashboard, active: true }, { key: "conversations", icon: MessagesSquare, badge: "3" }, { key: "customers", icon: Users }] },
  { key: "business", items: [{ key: "products", icon: Package }, { key: "orders", icon: ShoppingBag }, { key: "knowledge", icon: BookOpen }] },
  { key: "ai", items: [{ key: "assistant", icon: Bot }, { key: "automations", icon: Workflow }] },
  { key: "insights", items: [{ key: "analytics", icon: ChartColumn }] },
  { key: "settings", items: [{ key: "whatsapp", icon: Smartphone }, { key: "team", icon: UsersRound }, { key: "billing", icon: CreditCard }, { key: "settings", icon: Settings }] },
];

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-white p-4", className)}>
      <p className="text-sm font-semibold text-deep">{title}</p>
      {children}
    </div>
  );
}

/** Full dashboard preview for the "more than a chatbot" section. */
export async function DashboardMock({ className }: { className?: string }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const t = messages.dashboardMock;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-white shadow-float", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-coral-500/70" />
        <span className="size-2.5 rounded-full bg-gold" />
        <span className="size-2.5 rounded-full bg-waza-500" />
        <span className="ml-3 hidden rounded-md bg-white px-3 py-0.5 text-[0.6875rem] text-slate sm:inline">
          {t.windowTitle}
        </span>
      </div>

      <div className="flex">
        <aside className="hidden w-52 shrink-0 bg-deep p-4 md:block">
          <WazaBoltLogo tone="dark" size="sm" className="mb-5" />
          <div className="space-y-4">
            {navGroups.map((g) => (
              <div key={g.key}>
                <p className="mb-1 px-2.5 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-white/40">{t.nav.groups[g.key]}</p>
                <ul className="space-y-0.5">
                  {g.items.map(({ key, icon: Icon, active, badge }) => (
                    <li
                      key={key}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem]",
                        active ? "bg-waza-500 font-semibold text-deep" : "text-white/70",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {t.nav.items[key]}
                      {badge ? (
                        <span className="ml-auto rounded-full bg-gold px-1.5 text-[0.625rem] font-bold text-deep">{badge}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-cream p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold text-deep sm:text-xl">{t.greeting}</p>
              <p className="text-xs text-slate sm:text-sm">{t.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <AIStatus />
              <span className="grid size-8 place-items-center rounded-full bg-gold text-[0.6875rem] font-bold text-deep">MJ</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.key} className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs text-slate">{t.metrics[m.key]}</p>
                <p className="font-display text-2xl font-bold text-deep">
                  <CountUp value={m.value} suffix={m.suffix} />
                </p>
                <p className="flex items-center gap-1 text-[0.6875rem] font-medium text-waza-700">
                  <TrendingUp className="size-3" aria-hidden /> {m.trend}
                  <span className="font-normal text-slate">{t.fromYesterday}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-coral-200 bg-coral-50 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coral-500 text-white">
              <Hand className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 text-xs sm:text-sm">
              <p className="font-semibold text-deep">{t.humanTitle}</p>
              <p className="text-slate">{t.humanText}</p>
            </div>
            <span className="ml-auto hidden shrink-0 rounded-full bg-deep px-3 py-1 text-xs font-semibold text-white sm:inline">
              {t.openChat}
            </span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Panel title={t.recentConversations} className="lg:col-span-3">
              <ul className="mt-1 divide-y divide-line">
                {conversations.map((c, i) => (
                  <li key={c.initials} className="flex items-center gap-3 py-2.5">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", iconTones[c.tone])} aria-hidden>
                      {c.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-deep">{t.conversations[i]?.name}</p>
                      <p className="truncate text-xs text-slate">{t.conversations[i]?.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[0.6875rem] text-slate">{c.time}</span>
                      <AIStatus mode={c.mode} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t.latestOrders} className="lg:col-span-2">
              <ul className="mt-1 divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.ref} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-deep">
                        {o.ref} <span className="font-normal text-slate">· {o.item}</span>
                      </p>
                      <p className="text-xs text-slate">{formatXaf(o.amount, locale)}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold", statusStyle[o.status])}>
                      {t.orderStatus[o.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t.mostAsked} className="lg:col-span-3">
              <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                {products.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2.5 rounded-lg bg-surface p-2">
                    {i === 0 ? (
                      <Image src="/images/product-robe-wax.webp" alt="" width={66} height={80} className="h-10 w-8 rounded-md object-cover" />
                    ) : (
                      <span className="grid h-10 w-8 place-items-center rounded-md bg-mint text-waza-700">
                        <Package className="size-4" aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-xs font-semibold text-deep">{p.name}</p>
                      <p className="text-[0.6875rem] text-slate">{formatXaf(p.price, locale)}</p>
                      <p className="text-[0.625rem] text-waza-700">{format(t.askedToday, { count: p.asked })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t.newCustomers} className="lg:col-span-2">
              <ul className="mt-1 divide-y divide-line">
                {newCustomers.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 py-2">
                    <span className="grid size-7 place-items-center rounded-full bg-gold-100 text-[0.625rem] font-bold text-gold-800">{c.initials}</span>
                    <p className="flex-1 text-sm font-medium text-deep">{c.name}</p>
                    <span className="flex items-center gap-1 text-xs text-slate">
                      <UserPlus className="size-3" aria-hidden /> {c.city}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small dashboard card used inside the hero composition. */
export async function DashboardMockCompact({ className }: { className?: string }) {
  const t = (await getMessages()).dashboardMock;
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-white shadow-float", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <WazaBoltLogo layout="icon" size="sm" className="size-7" />
          <div>
            <p className="font-display text-sm font-bold text-deep">{t.greeting}</p>
            <p className="text-[0.625rem] text-slate">{t.subtitleShort}</p>
          </div>
        </div>
        <AIStatus size="sm" />
      </div>
      <div className="grid grid-cols-4 gap-2 bg-cream p-3">
        {metrics.map((m) => (
          <div key={m.key} className="rounded-xl border border-line bg-white p-2.5">
            <p className="truncate text-[0.625rem] text-slate">{t.metrics[m.key]}</p>
            <p className="font-display text-lg font-bold text-deep">
              <CountUp value={m.value} suffix={m.suffix} />
            </p>
            <p className="flex items-center gap-1 text-[0.5625rem] font-medium text-waza-700">
              <TrendingUp className="size-2.5" aria-hidden /> {m.trend}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-coral-500 text-white">
          <Hand className="size-3" aria-hidden />
        </span>
        <p className="text-[0.6875rem] text-deep">
          <span className="font-semibold">{t.humanCompact}</span>
          <span className="text-slate">{t.humanCompactReason}</span>
        </p>
      </div>
    </div>
  );
}
