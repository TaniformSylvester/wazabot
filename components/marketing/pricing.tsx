import Link from "next/link";
import { Check, Info, Zap } from "lucide-react";

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
          description="Start free. Upgrade when your customers keep WazaBolt busy."
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1",
                plan.highlighted
                  ? "bg-ink text-sand shadow-float lg:-translate-y-3 lg:hover:-translate-y-4"
                  : "border border-border bg-card shadow-card",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-bolt-500 px-3 py-1 text-xs font-bold text-ink">
                  <Zap className="size-3 fill-current" aria-hidden /> Recommended
                </span>
              ) : null}
              <h3 className={cn("type-h3 text-xl", plan.highlighted && "text-sand")}>{plan.name}</h3>
              <p className={cn("mt-1 min-h-10 text-sm", plan.highlighted ? "text-sand/70" : "text-stone")}>
                {plan.description}
              </p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-extrabold tracking-tight">{formatXaf(plan.monthlyPrice)}</span>
                <span className={cn("text-sm", plan.highlighted ? "text-sand/70" : "text-stone")}>/month</span>
              </p>
              <p
                className={cn(
                  "mt-4 flex flex-col rounded-xl px-4 py-3",
                  plan.highlighted ? "bg-sand/10" : "bg-bolt-50",
                )}
              >
                <span className={cn("font-display text-xl font-bold", plan.highlighted ? "text-bolt-400" : "text-bolt-800")}>
                  {numberFormat.format(plan.aiConversationsPerMonth)}
                </span>
                <span className="text-sm">AI conversations / month</span>
              </p>
              <Button
                asChild
                variant={plan.highlighted ? "default" : "outline"}
                className="mt-6 w-full"
              >
                <Link href={`/register?plan=${plan.id}`}>
                  {plan.monthlyPrice === 0 ? "Get Started" : `Choose ${plan.name}`}
                </Link>
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <p className="text-sm font-semibold text-ink">Every plan includes</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {planInclusions.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-stone">
                  <Check className="mt-0.5 size-4 shrink-0 text-ember-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-4 rounded-3xl bg-bolt-100 p-6">
            <Info className="mt-0.5 size-5 shrink-0 text-bolt-800" aria-hidden />
            <div className="text-sm leading-relaxed text-ink">
              <p className="font-semibold">AI usage is metered — no &ldquo;unlimited&rdquo; surprises.</p>
              <p className="mt-1 text-ink/80">
                Each plan includes a monthly number of AI conversations. When you reach your limit,
                automatic replies stop and new messages wait for your team in the dashboard — nothing
                is lost. You can upgrade at any time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
