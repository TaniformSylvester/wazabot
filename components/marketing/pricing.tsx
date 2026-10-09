import { Check, Info } from "lucide-react";

import { PricingCard } from "@/components/marketing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { plans } from "@/config/plans";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";

export async function Pricing() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const t = messages.pricing;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-mint/60 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading
          id="pricing-title"
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PricingCard plan={plan} locale={locale} t={t} startFree={messages.common.nav.startFree} recommended={messages.common.badges.recommended} />
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <p className="text-sm font-semibold text-deep">{t.includesTitle}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {t.inclusions.map((item) => (
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
              <p className="font-semibold">{t.meteredTitle}</p>
              <p className="mt-1 text-deep/80">{t.meteredText}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
