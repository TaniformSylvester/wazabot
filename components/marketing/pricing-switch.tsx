"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type Currency = "XAF" | "USD";
type Audience = "shop" | "school";
type Interval = "month" | "year";

/**
 * The controls over the price cards, in this order: the type of business
 * (shops and restaurants, or schools), monthly or annual billing, and where the
 * business is (Cameroon in FCFA, or another country in US dollars). Every
 * combination is rendered on the server (search engines and visitors without
 * JavaScript get them all; the FCFA shop plans, monthly, show first); this only
 * picks which three cards are visible. The annual prices show through
 * data-interval on the wrapper (group/billing), as with BillingToggle.
 */
export function PricingSwitch({
  labels,
  billing,
  panels,
  anchors,
  initialAudience = "shop",
}: {
  labels: { currency: string; xaf: string; usd: string; audience: string; shop: string; school: string };
  billing: { choice: string; monthly: string; annual: string; badge: string };
  panels: Record<`${Currency}-${Audience}`, React.ReactNode>;
  /** A line above the cards for each currency (the starting price). */
  anchors?: Partial<Record<Currency, React.ReactNode>>;
  initialAudience?: Audience;
}) {
  const [currency, setCurrency] = useState<Currency>("XAF");
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [interval, setInterval] = useState<Interval>("month");
  const pill = (active: boolean) =>
    cn("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors", active ? "bg-deep text-white" : "text-deep hover:bg-white");
  const group = <T extends string>(label: string, testId: string, value: T, set: (v: T) => void, options: [T, string, string?][]) => (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-full border border-line bg-mint p-1" data-testid={testId}>
      {options.map(([v, text, badge]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => set(v)} className={pill(value === v)}>
          {text}
          {badge ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", value === v ? "bg-gold text-deep" : "bg-gold-100 text-gold-800")}>{badge}</span> : null}
        </button>
      ))}
    </div>
  );
  return (
    <div data-currency={currency} data-audience={audience} data-interval={interval} className="group/billing">
      <div className="flex flex-col items-center gap-3">
        {group(labels.audience, "audience-switch", audience, setAudience, [
          ["shop", labels.shop],
          ["school", labels.school],
        ])}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          {group(billing.choice, "billing-toggle", interval, setInterval, [
            ["month", billing.monthly],
            ["year", billing.annual, billing.badge],
          ])}
          {group(labels.currency, "currency-switch", currency, setCurrency, [
            ["XAF", labels.xaf],
            ["USD", labels.usd],
          ])}
        </div>
      </div>
      {anchors?.[currency] ? (
        <p className="mx-auto mt-8 max-w-2xl text-center font-display text-lg font-bold text-deep sm:text-xl" data-testid="pricing-anchor">
          {anchors[currency]}
        </p>
      ) : null}
      {(Object.keys(panels) as (keyof typeof panels)[]).map((key) => (
        <div key={key} hidden={key !== `${currency}-${audience}`} data-panel={key}>
          {panels[key]}
        </div>
      ))}
    </div>
  );
}
