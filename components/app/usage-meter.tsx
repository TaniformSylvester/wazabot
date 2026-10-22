import type { Locale } from "@/lib/i18n/config";
import { format, formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** "{used} of {max}" with a bar (or "{used} · unlimited"); red once the limit is reached and in force. */
export function UsageMeter({
  label,
  used,
  max,
  enforced = true,
  locale,
  text,
  testId,
}: {
  label: string;
  used: number;
  max: number | null;
  enforced?: boolean;
  locale: Locale;
  text: { of: string; unlimited: string };
  testId?: string;
}) {
  const full = enforced && max !== null && used >= max;
  return (
    <div className="rounded-2xl bg-surface p-4" data-testid={testId}>
      <dt className="text-sm text-slate">{label}</dt>
      <dd className={cn("mt-1 font-display text-xl font-bold", full ? "text-coral-700" : "text-deep")}>
        {max === null
          ? format(text.unlimited, { used: formatNumber(used, locale) })
          : format(text.of, {
              used: formatNumber(used, locale),
              max: formatNumber(max, locale),
            })}
      </dd>
      {max !== null ? (
        <div className="mt-2 h-1.5 rounded-full bg-border">
          <div
            className={cn("h-1.5 rounded-full", full ? "bg-coral-600" : "bg-waza-600")}
            style={{
              width: `${Math.min(100, Math.round((used / max) * 100))}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
