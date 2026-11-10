import { BillingToggle } from "@/components/marketing/billing-toggle";
import { PricingCard } from "@/components/marketing/pricing-card";
import { plans } from "@/config/plans";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { format, formatAmount } from "@/lib/i18n/format";
import { usdPlans } from "@/lib/marketing/country-copy";

/** The plans in a business type's own terms, on its landing page: schools (students, teachers, report cards) or restaurants (kitchen accounts, tables, bills). */
export async function AudiencePlans({ audience }: { audience: "school" | "restaurant" }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const t = messages.pricing;
  const s = t[audience];
  const usd = Object.fromEntries(usdPlans().map((p, i) => [`p${i + 1}`, formatAmount(p.monthlyPrice, "USD", locale)]));
  return (
    <section id="plans" aria-labelledby="audience-plans-title" className="bg-mint/60 py-16 scroll-mt-20" data-testid={`${audience}-plans`}>
      <div className="container-page">
        <h2 id="audience-plans-title" className="type-h2 text-center">
          {s.title}
        </h2>
        <p className="type-body mx-auto mt-3 max-w-2xl text-center text-slate">{s.description}</p>
        <BillingToggle labels={{ choice: t.billingChoice, monthly: t.monthly, annual: t.annual, badge: t.annualBadge }}>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {plans.map((plan, i) => (
              <li key={plan.id}>
                <PricingCard plan={plan} previous={i > 0 ? plans[i - 1] : undefined} locale={locale} t={t} recommended={messages.common.badges.recommended} audience={audience} />
              </li>
            ))}
          </ul>
        </BillingToggle>
        <p className="mt-6 text-center text-sm text-slate">{format(t.school.outside, usd)}</p>
      </div>
    </section>
  );
}
