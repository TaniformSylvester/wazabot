import Link from "next/link";
import { Check, Minus, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { annualMonthsPaid, type Plan } from "@/config/plans";
import type { Locale } from "@/lib/i18n/config";
import { format, formatNumber, formatXaf } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

/** What each plan lists: its own features, with "Everything in …" for the bigger plans. */
export function planFeatures(plan: Plan, previous: Plan | undefined, t: Messages["pricing"], locale: Locale) {
  const f = t.features;
  const n = (v: number) => formatNumber(v, locale);
  const users = { label: format(plan.maxMembers === 1 ? f.members : f.membersPlural, { count: n(plan.maxMembers) }), included: true };
  const shops = {
    label: plan.includedBranches > 1 ? format(f.shops, { count: n(plan.includedBranches), price: formatXaf(plan.extraBranchPrice ?? 0, locale) }) : f.shop,
    included: true,
  };
  const own = [
    { label: f.expenses, included: plan.hasProfit },
    { label: f.profit, included: plan.hasProfit },
    { label: f.reports, included: plan.hasReports },
    { label: f.stockHistory, included: plan.hasStockHistory },
    { label: f.paymentNotes, included: plan.hasPaymentNotes },
  ];
  if (!previous) {
    return [users, shops, { label: f.products, included: true }, { label: f.sales, included: true }, { label: f.credit, included: true }, { label: f.receipts, included: true }, ...own];
  }
  const before = [previous.hasProfit, previous.hasProfit, previous.hasReports, previous.hasStockHistory, previous.hasPaymentNotes];
  const added = own.filter((x, i) => x.included && !before[i]);
  return [users, shops, { label: format(f.everythingIn, { plan: t.plans[previous.id].name }), included: true }, ...added];
}

export function PricingCard({ plan, previous, locale, t, recommended }: { plan: Plan; previous?: Plan; locale: Locale; t: Messages["pricing"]; recommended: string }) {
  const featured = plan.highlighted;
  const { name, description } = t.plans[plan.id];
  const features = planFeatures(plan, previous, t, locale);
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1",
        featured ? "bg-deep text-white shadow-float lg:-translate-y-3 lg:hover:-translate-y-4" : "border border-line bg-white shadow-card",
      )}
      data-testid={`plan-card-${plan.id}`}
    >
      {featured ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-bold text-deep">
          <Zap className="size-3 fill-current" aria-hidden /> {recommended}
        </span>
      ) : null}
      <h3 className={cn("type-h3 text-xl", featured && "text-white")}>{name}</h3>
      <p className={cn("mt-1 min-h-10 text-sm", featured ? "text-white/70" : "text-slate")}>{description}</p>
      <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 group-data-[interval=year]/billing:hidden" data-testid="price-month">
        <span className="font-display text-3xl font-extrabold tracking-tight whitespace-nowrap">{formatXaf(plan.monthlyPrice, locale)}</span>
        <span className={cn("text-sm", featured ? "text-white/70" : "text-slate")}>{t.perMonth}</span>
      </p>
      <div className="mt-5 hidden group-data-[interval=year]/billing:block" data-testid="price-year">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-3xl font-extrabold tracking-tight whitespace-nowrap">{formatXaf(plan.monthlyPrice * annualMonthsPaid, locale)}</span>
          <span className={cn("text-sm", featured ? "text-white/70" : "text-slate")}>{t.perYear}</span>
        </p>
        <p className={cn("mt-1 text-xs", featured ? "text-white/70" : "text-slate")}>
          <s>{formatXaf(plan.monthlyPrice * 12, locale)}</s> · {t.annualNote}
        </p>
      </div>
      <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
        {features.map((f) => (
          <li key={f.label} className={cn("flex items-start gap-2", !f.included && (featured ? "text-white/45" : "text-slate/70"))}>
            {f.included ? (
              <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-waza-400" : "text-waza-600")} aria-hidden />
            ) : (
              <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>
              {f.included ? null : <span className="sr-only">{t.notIncluded} </span>}
              {f.label}
            </span>
          </li>
        ))}
      </ul>
      <Button asChild variant={featured ? "default" : "outline"} className="mt-6 h-auto min-h-11 w-full px-4 py-2.5 text-center leading-snug whitespace-normal">
        <Link href={localizePath(locale, `/register?plan=${plan.id}`)}>{format(t.choose, { plan: name })}</Link>
      </Button>
      <p className={cn("mt-2 text-center text-xs", featured ? "text-white/70" : "text-slate")}>{t.trialNote}</p>
    </div>
  );
}
