import Link from "next/link";
import { Bot, Check, CreditCard, Info } from "lucide-react";

import { BillingToggle } from "@/components/marketing/billing-toggle";
import { PricingCard } from "@/components/marketing/pricing-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { addons, aiTopup, aiTrial, bundles, plans } from "@/config/plans";
import { aiLaunchedForPublicPages } from "@/lib/billing/ai-flag";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatAmount, formatNumber, formatXaf } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { usdPlans } from "@/lib/marketing/country-copy";

export async function Pricing() {
  const [locale, messages, aiLaunched] = await Promise.all([getLocale(), getMessages(), aiLaunchedForPublicPages()]);
  const t = messages.pricing;
  const ai = t.ai;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-mint/60 py-20 sm:py-28">
      <div className="container-page">
        <SectionHeading id="pricing-title" eyebrow={t.eyebrow} title={t.title} description={t.description} />

        <div className="mt-10">
          <BillingToggle labels={{ choice: t.billingChoice, monthly: t.monthly, annual: t.annual, badge: t.annualBadge }}>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {plans.map((plan, i) => (
                <li key={plan.id}>
                  <PricingCard plan={plan} previous={i > 0 ? plans[i - 1] : undefined} locale={locale} t={t} recommended={messages.common.badges.recommended} />
                </li>
              ))}
            </ul>
          </BillingToggle>
          <p className="mt-6 text-center text-sm">
            <Link href={`${localizePath(locale, "/solutions/schools")}#plans`} className="font-semibold text-waza-700 hover:underline" data-testid="pricing-schools-link">
              {t.school.link} →
            </Link>
          </p>
        </div>

        <section aria-labelledby="ai-addon-title" className="mt-12 rounded-2xl border border-line bg-white p-6 shadow-card" data-testid="ai-addon">
          <div className="flex flex-wrap items-center gap-3">
            <Bot className="size-6 text-waza-600" aria-hidden />
            <h3 id="ai-addon-title" className="type-h3 text-xl">
              {ai.title}
            </h3>
            {aiLaunched ? null : (
              <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-800" data-testid="ai-coming-soon">
                {ai.comingSoon}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate">{aiLaunched ? ai.text : `${ai.text} ${ai.comingSoonText}`}</p>
          <ul className={aiLaunched ? "mt-5 grid gap-4 sm:grid-cols-2" : "mt-5 grid gap-4 opacity-70 sm:grid-cols-2"}>
            {addons.map((a) => (
              <li key={a.id} className="rounded-xl bg-mint px-4 py-3">
                <p className="font-semibold text-deep">
                  {ai.addons[a.id].name} <span className="whitespace-nowrap text-waza-700">{format(ai.perMonthExtra, { price: formatXaf(a.monthlyPrice, locale) })}</span>
                </p>
                <p className="text-sm text-slate">{format(ai.conversations, { count: formatNumber(a.conversationsPerMonth, locale) })}</p>
                <p className="mt-1 text-xs text-slate">{ai.addons[a.id].description}</p>
              </li>
            ))}
          </ul>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm text-slate">
            {bundles.map((b) => {
              const plan = plans.find((p) => p.id === b.planId);
              const addon = addons.find((a) => a.id === b.addonId);
              if (!plan || !addon) return null;
              return (
                <li key={`${b.planId}-${b.addonId}`} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
                  {format(ai.bundle, {
                    plan: t.plans[plan.id].name,
                    addon: ai.addons[addon.id].name,
                    price: formatXaf(b.monthlyPrice, locale),
                    list: formatXaf(plan.monthlyPrice + addon.monthlyPrice, locale),
                  })}
                </li>
              );
            })}
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
              {format(ai.topup, { price: formatXaf(aiTopup.price, locale), count: formatNumber(aiTopup.conversations, locale) })}
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-waza-600" aria-hidden />
              {format(ai.trial, { days: aiTrial.days, count: aiTrial.conversations })}
            </li>
          </ul>
          <p className="mt-4 flex gap-2 rounded-xl bg-gold-50 px-4 py-3 text-sm text-deep">
            <Info className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
            <span>
              <b>{ai.meteredTitle}.</b> {ai.meteredText}
            </span>
          </p>
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
            <CreditCard className="mt-0.5 size-5 shrink-0 text-gold-800" aria-hidden />
            <div className="text-sm leading-relaxed text-deep">
              <p className="font-semibold">{t.paymentTitle}</p>
              <p className="mt-1 text-deep/80">{t.paymentText}</p>
              <p className="mt-3 font-semibold" data-testid="pricing-outside">
                {t.outsideTitle}
              </p>
              <p className="mt-1 text-deep/80">
                {format(t.outsideText, Object.fromEntries(usdPlans().map((p, i) => [`p${i + 1}`, formatAmount(p.monthlyPrice, "USD", locale)])))}{" "}
                <Link href={localizePath(locale, "/countries")} className="font-semibold text-waza-700 hover:underline">
                  {t.outsideLink}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
