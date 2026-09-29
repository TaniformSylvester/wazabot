"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * WazaBolt AI status: "● AI Online" (green) when WazaBolt is answering,
 * "● Human Mode" (coral) when a person has taken over.
 */
export function AIStatus({
  mode = "ai",
  size = "md",
  className,
}: {
  mode?: "ai" | "human";
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useI18n();
  const ai = mode === "ai";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[0.625rem]" : "px-2.5 py-1 text-xs",
        ai ? "bg-mint text-waza-800" : "bg-coral-50 text-coral-700",
        className,
      )}
    >
      <span className="relative flex size-2" aria-hidden>
        {ai ? <span className="absolute inset-0 animate-ping rounded-full bg-waza-400 opacity-60" /> : null}
        <span className={cn("relative size-2 rounded-full", ai ? "bg-waza-500" : "bg-coral-500")} />
      </span>
      {ai ? t.common.status.aiOnline : t.common.status.humanMode}
    </span>
  );
}
