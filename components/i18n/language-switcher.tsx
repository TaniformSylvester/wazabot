"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { setUiLocale } from "@/lib/actions/settings";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "@/lib/i18n/config";
import { switchLocalePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

function saveLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * EN | FR switch. Keeps the current page and query string. With `persist`
 * (dashboard), the choice is also saved on the user's profile so emails and
 * future sessions use it.
 */
export function LanguageSwitcher({
  tone = "light",
  persist = false,
  compact = false,
  className,
}: {
  tone?: "light" | "dark";
  persist?: boolean;
  /** Hide the globe icon (tight headers). */
  compact?: boolean;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (target: Locale) => {
    if (target === locale) return;
    // Read at click time (no useSearchParams, so static pages stay static).
    const href = `${switchLocalePath(pathname, target)}${window.location.search}`;
    saveLocaleCookie(target);
    startTransition(async () => {
      if (persist) await setUiLocale(target);
      router.push(href);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t.common.language.switcher}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-semibold",
        tone === "dark" ? "bg-white/10 text-white/80" : "border border-line bg-white text-slate",
        pending && "opacity-70",
        className,
      )}
    >
      {compact ? null : <Languages className="mx-1.5 hidden size-3.5 sm:block" aria-hidden />}
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => choose(l)}
            disabled={pending}
            aria-pressed={active}
            title={t.common.language.names[l]}
            className={cn(
              "inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waza-500/50",
              active
                ? tone === "dark"
                  ? "bg-waza-500 text-deep"
                  : "bg-deep text-white"
                : tone === "dark"
                  ? "hover:text-white"
                  : "hover:text-deep",
            )}
          >
            <span className="sr-only">{t.common.language.names[l]}</span>
            <span aria-hidden>{l}</span>
          </button>
        );
      })}
    </div>
  );
}
