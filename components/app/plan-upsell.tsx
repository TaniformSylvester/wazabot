import Link from "next/link";
import { Lock } from "lucide-react";

import { localizePath } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/config";

/** A short "needs a bigger plan" notice with a link to Billing. */
export function PlanUpsell({ title, text, cta, locale, compact }: { title?: string; text: string; cta: string; locale: Locale; compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-gold-50 px-4 py-3 text-sm text-deep" : "rounded-2xl border border-gold-200 bg-gold-50 p-5 text-deep"} data-testid="plan-upsell">
      <p className={compact ? "flex items-center gap-2" : "flex items-center gap-2 font-semibold"}>
        <Lock className="size-4 shrink-0 text-gold-800" aria-hidden />
        {title ?? text}
      </p>
      {title ? <p className="mt-1 text-sm text-deep/80">{text}</p> : null}
      <Link href={localizePath(locale, "/dashboard/billing")} className={compact ? "font-semibold text-waza-700 hover:underline" : "mt-3 inline-block font-semibold text-waza-700 hover:underline"}>
        {cta} →
      </Link>
    </div>
  );
}
