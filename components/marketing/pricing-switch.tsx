"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type Currency = "XAF" | "USD";
type Audience = "shop" | "school";

/**
 * Two switches over the price cards: where the business is (Cameroon in FCFA,
 * or another country in US dollars) and its type (shops and restaurants, or
 * schools). Every combination is rendered on the server (search engines and
 * visitors without JavaScript get them all; the FCFA shop plans show first);
 * this only picks which one is visible.
 */
export function PricingSwitch({
  labels,
  panels,
  initialAudience = "shop",
}: {
  labels: { currency: string; xaf: string; usd: string; audience: string; shop: string; school: string };
  panels: Record<`${Currency}-${Audience}`, React.ReactNode>;
  initialAudience?: Audience;
}) {
  const [currency, setCurrency] = useState<Currency>("XAF");
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const pill = (active: boolean) =>
    cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors", active ? "bg-deep text-white" : "text-deep hover:bg-white");
  const group = <T extends string>(label: string, testId: string, value: T, set: (v: T) => void, options: [T, string][]) => (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-line bg-mint p-1" data-testid={testId}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => set(v)} className={pill(value === v)}>
          {text}
        </button>
      ))}
    </div>
  );
  return (
    <div data-currency={currency} data-audience={audience}>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {group(labels.currency, "currency-switch", currency, setCurrency, [
          ["XAF", labels.xaf],
          ["USD", labels.usd],
        ])}
        {group(labels.audience, "audience-switch", audience, setAudience, [
          ["shop", labels.shop],
          ["school", labels.school],
        ])}
      </div>
      {(Object.keys(panels) as (keyof typeof panels)[]).map((key) => (
        <div key={key} hidden={key !== `${currency}-${audience}`} data-panel={key}>
          {panels[key]}
        </div>
      ))}
    </div>
  );
}
