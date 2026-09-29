import { useId } from "react";

import { cn } from "@/lib/utils";

/*
 * WazaBolt symbol: a rounded business-conversation bubble carrying a bold
 * "W", with a Golden lightning bolt breaking through the top-right corner
 * (speed, automation, instant response). 48×48 grid, thick strokes so it
 * holds up from 16px favicons to print.
 *
 * Keep in sync with lib/brand/mark-svg.ts (static SVG for icons/OG images).
 */
export const MARK_BUBBLE_PATH =
  "M12 9h17a10 10 0 0 1 10 10v11a10 10 0 0 1-10 10H17.5l-7.4 5.7c-.9.7-2.1 0-2.1-1V39.2A10 10 0 0 1 2 30V19A10 10 0 0 1 12 9Z";
export const MARK_W_PATH = "M9.5 18.5 13.6 31.5l5.4-10 5.4 10 4.1-13";
export const MARK_BOLT_PATH = "M40.5 1 30.5 15h6.8l-4.6 12.5L46 11h-7l4.8-10z";

type IconProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
  /**
   * "color" — full colour (default).
   * "mono"  — single colour using `currentColor` (stamps, embossing, fax…).
   */
  variant?: "color" | "mono";
  /** Background the icon sits on; sets the thin knockout line around the bolt. */
  tone?: "light" | "dark";
};

export function WazaBoltIcon({ className, title, variant = "color", tone = "light", ...props }: IconProps) {
  const id = useId();
  const gradient = `${id}-g`;
  const knockout = tone === "dark" ? "var(--color-deep)" : "var(--color-cream)";
  const mono = variant === "mono";

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("size-10 shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {!mono ? (
        <defs>
          <linearGradient id={gradient} x1="6" y1="8" x2="36" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1FC985" />
            <stop offset="1" stopColor="#0E8A5A" />
          </linearGradient>
        </defs>
      ) : null}
      <path d={MARK_BUBBLE_PATH} fill={mono ? "currentColor" : `url(#${gradient})`} />
      <path
        d={MARK_W_PATH}
        stroke={mono ? knockout : "#fff"}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={MARK_BOLT_PATH}
        fill={mono ? "currentColor" : "var(--color-gold)"}
        stroke={knockout}
        strokeWidth="2"
        strokeLinejoin="round"
        paintOrder="stroke"
        className="origin-center [transform-box:fill-box] group-hover/logo:animate-bolt-flash"
      />
    </svg>
  );
}

/** Small bolt used inside the "o" of the wordmark. */
function WordmarkBolt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 24" aria-hidden className={className}>
      <path d="M10 0 2 13.5h5L4.5 24 14 9.5H8.8L12 0z" fill="var(--color-gold)" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** Background the logo sits on: light = Deep Teal wordmark, dark = white wordmark. */
  tone?: "light" | "dark";
  /** horizontal = icon beside wordmark (primary); compact = icon above wordmark; icon = symbol only. */
  layout?: "horizontal" | "compact" | "icon";
  size?: "sm" | "md" | "lg" | "xl";
  withTagline?: boolean;
};

const sizes = {
  sm: { icon: "size-8", word: "text-xl", tag: "text-[0.625rem]", bolt: false },
  md: { icon: "size-10", word: "text-[1.625rem]", tag: "text-[0.6875rem]", bolt: true },
  lg: { icon: "size-14", word: "text-4xl", tag: "text-sm", bolt: true },
  xl: { icon: "size-20", word: "text-6xl", tag: "text-lg", bolt: true },
};

export const BRAND_TAGLINE = "Your AI Business Assistant on WhatsApp.";

/** The WazaBolt logo system: primary horizontal, compact (stacked) and icon-only. */
export function WazaBoltLogo({
  className,
  tone = "light",
  layout = "horizontal",
  size = "md",
  withTagline = false,
}: LogoProps) {
  const s = sizes[size];
  if (layout === "icon") return <WazaBoltIcon tone={tone} className={cn(s.icon, className)} title="WazaBolt" />;

  return (
    <span
      className={cn(
        "group/logo inline-flex",
        layout === "compact" ? "flex-col items-center gap-2 text-center" : "items-center gap-2.5",
        className,
      )}
    >
      <WazaBoltIcon tone={tone} className={s.icon} />
      <span className={cn("flex flex-col leading-none", layout === "compact" && "items-center")}>
        <span className={cn("font-display font-extrabold tracking-[-0.035em]", s.word)} aria-label="WazaBolt">
          <span aria-hidden className={tone === "dark" ? "text-white" : "text-deep"}>
            Waza
          </span>
          <span aria-hidden className={tone === "dark" ? "text-waza-400" : "text-waza-500"}>
            B
            {s.bolt ? (
              <span className="relative inline-block">
                o
                <WordmarkBolt className="absolute left-1/2 top-[57%] h-[0.36em] -translate-x-1/2 -translate-y-1/2" />
              </span>
            ) : (
              "o"
            )}
            lt
          </span>
        </span>
        {withTagline ? (
          <span className={cn("mt-1.5 font-medium", s.tag, tone === "dark" ? "text-white/75" : "text-slate")}>
            {BRAND_TAGLINE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
