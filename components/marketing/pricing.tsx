import { Check, Info } from "lucide-react";

import { PricingCard } from "@/components/marketing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { planInclusions, plans } from "@/config/plans";

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-mint/60 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title="Simple plans in FCFA"
          description="Start free. Upgrade when your customers keep WazaBolt busy."
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PricingCard plan={plan} />
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <p className="text-sm font-semibold text-deep">Every plan includes</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {planInclusions.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate">
                  <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-4 rounded-2xl bg-gold-100 p-6">
            <Info className="mt-0.5 size-5 shrink-0 text-gold-800" aria-hidden />
            <div className="text-sm leading-relaxed text-deep">
              <p className="font-semibold">AI usage is metered — no &ldquo;unlimited&rdquo; surprises.</p>
              <p className="mt-1 text-deep/80">
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
