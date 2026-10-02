import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Building2,
  CircleCheck,
  Clock,
  Hand,
  Inbox,
  MessagesSquare,
  Package,
  PackageX,
  ShoppingBag,
  Smartphone,
  UserPlus,
  Users,
} from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import { EmptyState, Panel, StatCard, StatusBadge, conversationStatusTone, formatDate, formatMoney, formatPercent, orderStatusTone } from "@/components/app/ui";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { hasOpeningHours } from "@/lib/business/hours";
import { getDashboardMetrics, getSetupProgress, getStockAlerts, listConversations, listOrders } from "@/lib/data/queries";
import { dashboardMetadata } from "@/lib/i18n/dashboard-meta";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatNumber } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";

export const generateMetadata = dashboardMetadata((d) => d.title);

const setupSteps = [
  { key: "profile", icon: Building2, href: "/dashboard/onboarding?step=1" },
  { key: "hours", icon: Clock, href: "/dashboard/onboarding?step=2" },
  { key: "products", icon: Package, href: "/dashboard/products/new" },
  { key: "knowledge", icon: BookOpen, href: "/dashboard/knowledge" },
  { key: "ai", icon: Bot, href: "/dashboard/ai" },
  { key: "whatsapp", icon: Smartphone, href: "/dashboard/whatsapp" },
] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/[lang]/dashboard">) {
  const [locale, t, params] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const { user, business } = await requireBusiness(localizePath(locale, "/dashboard"));
  const d = t.dashboard;
  const h = d.home;

  // New owners/admins start with the guided setup; it can be skipped at any step.
  if (!business.onboardingCompletedAt && business.onboardingStep === 0 && hasRole(business.role, "admin")) {
    redirect(localizePath(locale, `/dashboard/onboarding?step=1${params.welcome ? "&welcome=1" : ""}`));
  }

  const [metrics, progress, conversations, orders, stock] = await Promise.all([
    getDashboardMetrics(business.id),
    getSetupProgress(business.id, !!(business.description || business.industry || business.city), hasOpeningHours(business.openingHours)),
    listConversations(business.id),
    listOrders(business.id),
    getStockAlerts(business.id),
  ]);
  const done = setupSteps.filter((s) => progress[s.key === "ai" ? "aiConfigured" : s.key]).length;
  const firstName = user.fullName.split(" ")[0] || h.there;
  const n = (v: number) => formatNumber(v, locale);
  const href = (p: string) => localizePath(locale, p);

  const stats = [
    { label: h.metrics.conversations, value: n(metrics.conversations), icon: MessagesSquare },
    { label: h.metrics.newCustomers, value: n(metrics.newCustomers30d), icon: Users },
    { label: h.metrics.orders, value: n(metrics.orders), icon: ShoppingBag },
    { label: h.metrics.aiResolution, value: metrics.aiResolutionRate === null ? null : formatPercent(metrics.aiResolutionRate, locale), icon: Bot },
    { label: h.metrics.humanHandovers, value: n(metrics.humanHandovers), icon: Hand },
    { label: h.metrics.unread, value: n(metrics.unreadConversations), icon: Inbox },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {params.welcome ? <FormAlert tone="success">{h.welcomeConfirmed}</FormAlert> : null}
      {params.onboarded ? <FormAlert tone="success">{h.onboarded}</FormAlert> : null}
      {params.joined ? <FormAlert tone="success">{format(h.joined, { business: business.name })}</FormAlert> : null}

      <div>
        <h1 className="type-h2">{format(h.welcome, { name: firstName })}</h1>
        <p className="type-body mt-1 text-slate">{format(h.subtitle, { business: business.name })}</p>
      </div>

      <section aria-label={d.analytics.title}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <li key={s.label}>
              <StatCard label={s.label} value={s.value} icon={s.icon} noData={d.common.noDataYet} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate">{h.metricsNote}</p>
      </section>

      {done < setupSteps.length ? (
        <Panel
          id="setup"
          title={h.setupTitle}
          description={h.setupText}
          actions={<StatusBadge tone="blue">{format(h.progress, { done, total: setupSteps.length })}</StatusBadge>}
        >
          <ol className="grid gap-3 md:grid-cols-2">
            {setupSteps.map(({ key, icon: Icon, href: path }, i) => {
              const complete = progress[key === "ai" ? "aiConfigured" : key];
              return (
                <li key={key}>
                  <Link
                    href={href(path)}
                    className={
                      complete
                        ? "flex items-center gap-3 rounded-2xl bg-success-bg p-4"
                        : "flex items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-waza-500 hover:bg-mint/40"
                    }
                  >
                    <span className={complete ? "grid size-8 shrink-0 place-items-center text-success" : "grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-deep"}>
                      {complete ? <CircleCheck className="size-5" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-deep">
                      <span className="text-slate">{i + 1}.</span> {h.steps[key]}
                    </span>
                    {!complete ? <ArrowRight className="size-4 shrink-0 text-slate" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </Panel>
      ) : null}

      {stock.total ? (
        <Panel
          id="stock-alerts"
          title={h.stockAlerts.title}
          description={h.stockAlerts.text}
          actions={
            <Link href={href("/dashboard/products")} className="text-sm font-semibold text-waza-700 hover:underline">
              {h.stockAlerts.viewAll}
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {stock.alerts.map((a) => (
              <li key={`${a.productId}-${a.variant ?? ""}`}>
                <Link href={href(`/dashboard/products/${a.productId}`)} className="flex items-center gap-3 py-3 hover:bg-surface/60">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-deep">
                    <PackageX className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-deep">{a.name}</span>
                    {a.variant ? <span className="block truncate text-xs text-slate">{a.variant}</span> : null}
                  </span>
                  <StatusBadge tone={a.out ? "red" : "amber"}>{a.out ? h.stockAlerts.out : format(h.stockAlerts.left, { count: n(a.quantity) })}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section aria-label={h.quick.title} className="flex flex-wrap gap-2">
        {[
          { label: h.quick.product, href: "/dashboard/products/new", icon: Package },
          { label: h.quick.customer, href: "/dashboard/customers/new", icon: UserPlus },
          { label: h.quick.order, href: "/dashboard/orders/new", icon: ShoppingBag },
          { label: h.quick.faq, href: "/dashboard/knowledge/faqs/new", icon: BookOpen },
        ].map((q) => (
          <Link
            key={q.href}
            href={href(q.href)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-deep hover:bg-mint"
          >
            <q.icon className="size-4" aria-hidden /> {q.label}
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="recent-conversations" title={h.recentConversations}>
          {conversations.length ? (
            <ul className="divide-y divide-border">
              {conversations.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link href={href(`/dashboard/conversations/${c.id}`)} className="flex items-center gap-3 py-3 hover:bg-mint/30">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-deep">{c.customers?.name || `+${c.customers?.whatsapp_phone ?? ""}`}</span>
                      <span className="block text-xs text-slate">{formatDate(c.last_message_at ?? c.created_at, locale, true)}</span>
                    </span>
                    <StatusBadge tone={c.ai_enabled ? "blue" : "amber"}>{c.ai_enabled ? d.conversations.aiOnline : d.conversations.humanMode}</StatusBadge>
                    <StatusBadge tone={conversationStatusTone[c.status]}>{d.conversations.statuses[c.status as keyof typeof d.conversations.statuses] ?? c.status}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={MessagesSquare} title={d.common.noDataYet} text={h.noConversations} className="py-8" />
          )}
        </Panel>
        <Panel id="recent-orders" title={h.recentOrders}>
          {orders.rows.length ? (
            <ul className="divide-y divide-border">
              {orders.rows.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link href={href(`/dashboard/orders/${o.id}`)} className="flex items-center gap-3 py-3 hover:bg-mint/30">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-deep">{o.order_number}</span>
                      <span className="block truncate text-xs text-slate">{o.customers?.name || `+${o.customers?.whatsapp_phone ?? ""}`}</span>
                    </span>
                    <span className="text-sm font-semibold text-deep">{formatMoney(o.total, o.currency, locale)}</span>
                    <StatusBadge tone={orderStatusTone[o.status]}>{d.orders.statuses[o.status as keyof typeof d.orders.statuses] ?? o.status}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShoppingBag} title={d.common.noDataYet} text={h.noOrders} className="py-8" />
          )}
        </Panel>
      </div>
    </div>
  );
}
