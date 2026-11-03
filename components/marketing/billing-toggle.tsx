"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Monthly / annual switch for the price cards: both prices are in the page
 * (server-rendered); this only picks which one shows, through
 * data-interval on the wrapper (group/billing). Without JavaScript the
 * monthly prices show.
 */
export function BillingToggle({ labels, children }: { labels: { choice: string; monthly: string; annual: string; badge: string }; children: React.ReactNode }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const option = (value: "month" | "year", label: string, badge?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={interval === value}
      onClick={() => setInterval(value)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
        interval === value ? "bg-deep text-white" : "text-deep hover:bg-white",
      )}
    >
      {label}
      {badge ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", interval === value ? "bg-gold text-deep" : "bg-gold-100 text-gold-800")}>{badge}</span> : null}
    </button>
  );
  return (
    <div data-interval={interval} className="group/billing">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label={labels.choice} className="inline-flex gap-1 rounded-full border border-line bg-mint p-1" data-testid="billing-toggle">
          {option("month", labels.monthly)}
          {option("year", labels.annual, labels.badge)}
        </div>
      </div>
      {children}
    </div>
  );
}
