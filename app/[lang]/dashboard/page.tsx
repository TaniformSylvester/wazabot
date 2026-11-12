import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CalendarDays,
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
import { BusinessOverview } from "@/components/app/business-overview";
import { FreeMessagesPanel } from "@/components/app/free-messages-panel";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { EmptyState, Panel, StatCard, StatusBadge, conversationStatusTone, formatDate, formatMoney, formatPercent, orderStatusTone } from "@/components/app/ui";
import { businessCanUse } from "@/lib/billing/plan-access";
import { hasRole, requireBusiness } from "@/lib/auth/dal";
import { getBusinessModules } from "@/lib/modules";
import { hasOpeningHours } from "@/lib/business/hours";
import { getDashboardMetrics, getFreeWhatsAppMessages, getSetupProgress, getStockAlerts, listConversations, listNextAppointments, listOrders, listSales } from "@/lib/data/queries";
import { OVERDUE_CREDIT_DAYS, getOverview, getShopDashboard } from "@/lib/data/reports";
import { floorState, kitchenQueue } from "@/lib/data/restaurant";
import { getBranchContext } from "@/lib/branches";
import { plans } from "@/config/plans";
import { AttentionBanners, RestaurantToday, SalesVsExpenses, ShopToday, attentionIcons, type Attention } from "@/components/app/dashboard-sections";
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
  // New owners/admins start with the guided setup (it follows the business type and can be skipped at any step).
  if (!business.onboardingCompletedAt && business.onboardingStep === 0 && hasRole(business.role, "admin")) {
    redirect(localizePath(locale, `/dashboard/onboarding?step=1${params.welcome ? "&welcome=1" : ""}`));
  }
  // A school without the sales module starts on its school overview.
  const modules = await getBusinessModules(business);
  if (!modules.includes("commerce") && modules.includes("school")) redirect(localizePath(locale, "/dashboard/school"));
  const d = t.dashboard;
  const h = d.home;

  const isAdmin = hasRole(business.role, "admin");
  const planAllowsProfit = (await businessCanUse(business.id, "profit"));
  const showProfit = isAdmin && planAllowsProfit;
  const restaurant = modules.includes("restaurant");
  const branchId = restaurant ? (await getBranchContext(business)).current.id : undefined;
  const [metrics, progress, conversations, orders, stock, appointments, freeMessages, overview, recentSales, shop, floor, kitchen] = await Promise.all([
    getDashboardMetrics(business.id),
    getSetupProgress(business.id, !!(business.description || business.industry || business.city), hasOpeningHours(business.openingHours)),
    listConversations(business.id),
    listOrders(business.id, business.timezone),
    getStockAlerts(business.id),
    listNextAppointments(business.id),
    getFreeWhatsAppMessages(business.id),
    getOverview(business.id, business.timezone, showProfit),
    listSales(business.id, business.timezone, {}, showProfit),
    getShopDashboard(business.id, business.timezone, showProfit),
    restaurant ? floorState(business.id, branchId) : null,
    restaurant ? kitchenQueue(business.id, branchId) : null,
  ]);
  const apptTime = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { timeZone: business.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const done = setupSteps.filter((s) => progress[s.key === "ai" ? "aiConfigured" : s.key]).length;
  const firstName = user.fullName.split(" ")[0] || h.there;
  const n = (v: number) => formatNumber(v, locale);
  const href = (p: string) => localizePath(locale, p);

  // What needs doing now, most urgent first: each banner opens the page that deals with it.
  const at = h.attention;
  const kitchenCounts = kitchen?.tickets
    ? { new: kitchen.tickets.filter((x) => x.status === "new").length, preparing: kitchen.tickets.filter((x) => x.status === "preparing").length, ready: kitchen.tickets.filter((x) => x.status === "ready").length }
    : null;
  const openBills = floor ? floor.tables.filter((x) => x.bill).map((x) => x.bill!) : [];
  const readyRounds = floor ? [...openBills, ...floor.others].reduce((a, o) => a + o.readyRounds, 0) : 0;
  const attention: Attention[] = [
    readyRounds ? { key: "ready", text: format(at.dishesReady, { count: n(readyRounds) }), cta: at.dishesReadyCta, href: "/dashboard/restaurant", icon: attentionIcons.ready, tone: "blue" as const } : null,
    metrics.unreadConversations ? { key: "chats", text: format(at.chatsWaiting, { count: n(metrics.unreadConversations) }), cta: at.chatsWaitingCta, href: "/dashboard/conversations", icon: attentionIcons.chats, tone: "blue" as const } : null,
    shop.toHandOver.total ? { key: "orders", text: format(at.toHandOver, { count: n(shop.toHandOver.total) }), cta: at.toHandOverCta, href: "/dashboard/orders", icon: attentionIcons.orders, tone: "blue" as const } : null,
    stock.total ? { key: "stock", text: format(at.lowStock, { count: n(stock.total) }), cta: at.lowStockCta, href: "/dashboard/products", icon: attentionIcons.stock, tone: "gold" as const } : null,
    shop.overdueCredit.customers
      ? { key: "credit", text: format(at.overdueCredit, { count: n(shop.overdueCredit.customers), amount: formatMoney(shop.overdueCredit.amount, business.currency, locale), days: n(OVERDUE_CREDIT_DAYS) }), cta: at.overdueCreditCta, href: "/dashboard/customers?balance=1", icon: attentionIcons.credit, tone: "coral" as const }
      : null,
  ].filter((a) => a !== null);

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

      <AttentionBanners items={attention} label={at.label} locale={locale} />

      {floor ? (
        <RestaurantToday
          tables={floor.tables}
          openCount={openBills.length + floor.others.length}
          openTotal={[...openBills, ...floor.others].reduce((a, o) => a + o.total, 0)}
          turnover={overview.today.revenue}
          kitchen={kitchenCounts}
          maxKitchen={plans[0].maxKitchen}
          currency={business.currency}
          locale={locale}
          t={d}
        />
      ) : null}

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

      {isAdmin && !planAllowsProfit ? <PlanUpsell text={d.plan.profitLocked} cta={d.plan.upgrade} locale={locale} compact /> : null}
      <BusinessOverview
        overview={overview}
        recent={recentSales.rows.slice(0, 5)}
        currency={business.currency}
        locale={locale}
        t={d}
        showProfit={showProfit}
        canSell={hasRole(business.role, "agent")}
      />

      <ShopToday shop={shop} currency={business.currency} locale={locale} t={d} days={OVERDUE_CREDIT_DAYS} canSell={hasRole(business.role, "agent")} />

      {shop.trend ? (
        <SalesVsExpenses trend={shop.trend} view={params.trend === "week" ? "week" : "day"} currency={business.currency} locale={locale} t={d} />
      ) : null}

      <section aria-labelledby="whatsapp-title">
        <h2 id="whatsapp-title" className="type-h3 mb-4">
          {h.biz.whatsapp}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <li key={s.label}>
              <StatCard label={s.label} value={s.value} icon={s.icon} noData={d.common.noDataYet} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate">{h.metricsNote}</p>
      </section>


      {freeMessages ? <FreeMessagesPanel usage={freeMessages} text={h.freeMessages} locale={locale} /> : null}

      {appointments.length ? (
        <Panel
          id="next-appointments"
          title={d.appointments.home.title}
          actions={
            <Link href={href("/dashboard/appointments")} className="text-sm font-semibold text-waza-700 hover:underline">
              {d.appointments.home.viewAll}
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {appointments.map((appt) => (
              <li key={appt.id} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-deep">
                  <CalendarDays className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-deep">{appt.service_name}</span>
                  <span className="block truncate text-xs text-slate">{appt.customers?.name || appt.customers?.whatsapp_phone}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-deep">{apptTime.format(new Date(appt.starts_at))}</span>
              </li>
            ))}
          </ul>
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
                      <span className="block truncate text-xs text-slate">{o.customers ? o.customers.name || `+${o.customers.whatsapp_phone}` : o.channel === "pos" ? d.orders.walkIn : d.orders.notLinked}</span>
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
