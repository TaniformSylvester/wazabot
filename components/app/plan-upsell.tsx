import Link from "next/link";
import { Lock } from "lucide-react";

import { getCurrentBusiness } from "@/lib/auth/dal";
import { permissionsFor } from "@/lib/auth/permissions";
import { getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/config";

/**
 * A short "needs a bigger plan" notice. The owner gets the details and a link
 * to Billing; managers and staff only learn the feature isn't on the plan and
 * that the owner can change it (no prices, no Billing link).
 */
export async function PlanUpsell({
  title,
  text,
  cta,
  locale,
  compact,
  memberText,
}: {
  title?: string;
  text: string;
  cta: string;
  locale: Locale;
  compact?: boolean;
  /** What managers and staff read instead of `title`/`text`, when those speak to the owner. */
  memberText?: string;
}) {
  const [business, t] = await Promise.all([getCurrentBusiness(), getMessages()]);
  const owner = !!business && permissionsFor(business.role).canManageBilling;
  return (
    <div className={compact ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gold-50 px-4 py-3 text-sm text-deep" : "rounded-2xl border border-gold-200 bg-gold-50 p-5 text-deep"} data-testid="plan-upsell">
      <p className={compact ? "flex items-center gap-2" : "flex items-center gap-2 font-semibold"}>
        <Lock className="size-4 shrink-0 text-gold-800" aria-hidden />
        {owner ? (title ?? text) : (memberText ?? title ?? text)}
      </p>
      {title && owner ? <p className="mt-1 text-sm text-deep/80">{text}</p> : null}
      {owner ? (
        <Link href={localizePath(locale, "/dashboard/billing")} className={compact ? "font-semibold text-waza-700 hover:underline" : "mt-3 inline-block font-semibold text-waza-700 hover:underline"}>
          {cta} →
        </Link>
      ) : (
        <p className={compact ? "text-deep/80" : "mt-1 text-sm text-deep/80"} data-testid="plan-ask-owner">
          {t.dashboard.errors.ask_owner}
        </p>
      )}
    </div>
  );
}
