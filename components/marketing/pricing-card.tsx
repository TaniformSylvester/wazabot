import Link from "next/link";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Plan } from "@/config/plans";
import type { Locale } from "@/lib/i18n/config";
import { format, formatNumber, formatXaf } from "@/lib/i18n/format";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

export function PricingCard({
  plan,
  locale,
  t,
  startFree,
  recommended,
}: {
  plan: Plan;
  locale: Locale;
  t: Messages["pricing"];
  startFree: string;
  recommended: string;
}) {
  const featured = plan.highlighted;
  const { name, description } = t.plans[plan.id];
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1",
        featured ? "bg-deep text-white shadow-float lg:-translate-y-3 lg:hover:-translate-y-4" : "border border-line bg-white shadow-card",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-bold text-deep">
          <Zap className="size-3 fill-current" aria-hidden /> {recommended}
        </span>
      ) : null}
      <h3 className={cn("type-h3 text-xl", featured && "text-white")}>{name}</h3>
      <p className={cn("mt-1 min-h-10 text-sm", featured ? "text-white/70" : "text-slate")}>{description}</p>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-extrabold tracking-tight">{formatXaf(plan.monthlyPrice, locale)}</span>
        <span className={cn("text-sm", featured ? "text-white/70" : "text-slate")}>{t.perMonth}</span>
      </p>
      <p className={cn("mt-4 flex flex-col rounded-xl px-4 py-3", featured ? "bg-white/10" : "bg-mint")}>
        <span className={cn("font-display text-xl font-bold", featured ? "text-waza-400" : "text-waza-700")}>
          {formatNumber(plan.aiConversationsPerMonth, locale)}
        </span>
        <span className="text-sm">{t.aiConversations}</span>
      </p>
      <Button asChild variant={featured ? "default" : "outline"} className="mt-6 w-full">
        <Link href={localizePath(locale, `/register?plan=${plan.id}`)}>
          {plan.monthlyPrice === 0 ? startFree : format(t.choose, { plan: name })}
        </Link>
      </Button>
    </div>
  );
}
