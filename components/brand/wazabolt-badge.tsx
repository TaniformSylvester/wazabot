import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

const tones = {
  mint: "bg-mint text-waza-800 ring-1 ring-waza-200",
  gold: "bg-gold-100 text-gold-800 ring-1 ring-gold-200",
  dark: "bg-deep text-white ring-1 ring-white/10",
  outline: "bg-white text-deep ring-1 ring-line",
} as const;

/** Pill badge with the WazaBolt bolt — for eyebrows, "Coming soon", highlights. */
export function WazaBoltBadge({
  children,
  tone = "mint",
  icon = true,
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  icon?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {icon ? (
        <Zap className={cn("size-3.5", tone === "gold" ? "fill-gold-800" : "fill-gold text-gold")} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
