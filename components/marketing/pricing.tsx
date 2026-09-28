import Link from "next/link";
import { Check, Info } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { formatXaf, planInclusions, plans } from "@/config/plans";
import { cn } from "@/lib/utils";

export function Pricing() {
  const numberFormat = new Intl.NumberFormat("en-US");

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title="Simple plans in FCFA"
          description="Start free. Upgrade when your customers keep WazaBot busy."
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-6 shadow-card",
                plan.highlighted ? "border-2 border-waza-500 shadow-float lg:-translate-y-3" : "border-border",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-1 text-xs font-bold text-deep">
                  Recommended
                </span>
              ) : null}
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-slate-waza">{plan.description}</p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-heading text-3xl font-extrabold text-deep">
                  {formatXaf(plan.monthlyPrice)}
                </span>
                <span className="text-sm text-slate-waza">/month</span>
              </p>
              <p className="mt-4 flex flex-col rounded-xl bg-mint px-4 py-3">
                <span className="font-heading text-xl font-bold text-waza-800">
                  {numberFormat.format(plan.aiConversationsPerMonth)}
                </span>
                <span className="text-sm text-deep">AI conversations / month</span>
              </p>
              <Button
                asChild
                variant={plan.highlighted ? "default" : "outline"}
                className="mt-6 w-full"
              >
                <Link href={`/register?plan=${plan.id}`}>
                  {plan.monthlyPrice === 0 ? "Start Free" : `Choose ${plan.name}`}
                </Link>
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-card">
            <p className="text-sm font-semibold text-deep">Every plan includes</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {planInclusions.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-waza">
                  <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-4 rounded-3xl bg-gold-100 p-6">
            <Info className="mt-0.5 size-5 shrink-0 text-[#8a6100]" aria-hidden />
            <div className="text-sm leading-relaxed text-deep">
              <p className="font-semibold">AI usage is metered — no &ldquo;unlimited&rdquo; surprises.</p>
              <p className="mt-1 text-deep/80">
                Each plan includes a monthly number of AI conversations. When you reach your limit,
                WazaBot stops replying automatically and new messages wait for your team in the
                dashboard — nothing is lost. You can upgrade at any time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
