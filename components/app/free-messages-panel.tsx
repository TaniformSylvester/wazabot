import { Panel, formatDate } from "@/components/app/ui";
import type { Locale } from "@/lib/i18n/config";
import { format, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Free WhatsApp service messages left this month for the business's number — counts only, never prices. */
export function FreeMessagesPanel({
  usage,
  text,
  locale,
}: {
  usage: { left: number; total: number; resetsOn: string };
  text: { title: string; left: string; text: string };
  locale: Locale;
}) {
  const n = (v: number) => formatNumber(v, locale);
  return (
    <Panel id="free-whatsapp-messages" title={text.title}>
      <p className="font-display text-2xl font-bold text-deep">{format(text.left, { left: n(usage.left), total: n(usage.total) })}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label={text.title} aria-valuemin={0} aria-valuemax={usage.total} aria-valuenow={usage.left}>
        <div
          className={cn("h-full rounded-full", usage.left === 0 ? "bg-coral-600" : usage.left <= usage.total * 0.2 ? "bg-gold" : "bg-waza-500")}
          style={{ width: `${(usage.left / usage.total) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate">{format(text.text, { total: n(usage.total), reset: formatDate(usage.resetsOn, locale) })}</p>
    </Panel>
  );
}
