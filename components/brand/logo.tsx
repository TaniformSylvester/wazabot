import { useId } from "react";

import { cn } from "@/lib/utils";

/*
 * WazaBolt mark: a sharp, forward-leaning "W" (Waza) struck through the
 * centre by a lightning bolt (Bolt). Geometry lives on a 48×48 grid so the
 * mark holds up from 16px favicons to large print.
 *
 * Keep in sync with lib/brand/mark-svg.ts, which renders the same geometry
 * to static SVG strings for icons and the Open Graph image.
 */
export const MARK_W_PATH = "M8.5 13 15.5 36.5 24 15.5l8.5 21L39.5 13";
export const MARK_BOLT_PATH = "M26.5 4 20 23h6.2l-4.2 13.5 9.5-17.5h-6.3L29 4z";

type MarkProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
  /** "tile" sits on an Ink rounded square (light backgrounds, app icons); "glyph" is for dark backgrounds. */
  variant?: "tile" | "glyph";
};

export function LogoMark({ className, title, variant = "tile", ...props }: MarkProps) {
  const id = useId();
  const gradient = `${id}-g`;

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
      <defs>
        <linearGradient id={gradient} x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-bolt-400)" />
          <stop offset="1" stopColor="var(--color-ember-500)" />
        </linearGradient>
      </defs>
      {variant === "tile" ? <rect width="48" height="48" rx="13" fill="var(--color-ink)" /> : null}
      <path
        d={MARK_W_PATH}
        stroke={`url(#${gradient})`}
        strokeWidth="5.6"
        strokeLinejoin="miter"
        strokeMiterlimit="12"
      />
      <path
        d={MARK_BOLT_PATH}
        fill="var(--color-bolt-50)"
        stroke="var(--color-ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="origin-center [transform-box:fill-box] group-hover/logo:animate-bolt-flash"
      />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** Background the logo sits on. */
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
};

const sizes = {
  sm: { mark: "size-8", word: "text-lg", tag: "text-[0.625rem]" },
  md: { mark: "size-9", word: "text-[1.375rem]", tag: "text-[0.6875rem]" },
  lg: { mark: "size-14", word: "text-4xl", tag: "text-sm" },
};

/** Horizontal lockup: mark + "Waza" "Bolt" wordmark. */
export function Logo({ className, tone = "light", size = "md", withTagline = false }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("group/logo inline-flex items-center gap-2.5", className)}>
      <LogoMark className={s.mark} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display font-extrabold tracking-[-0.04em]", s.word)}>
          <span className={tone === "dark" ? "text-sand" : "text-ink"}>Waza</span>
          <span className={tone === "dark" ? "text-bolt-400" : "text-ember-600"}>Bolt</span>
        </span>
        {withTagline ? (
          <span className={cn("mt-1 font-medium", s.tag, tone === "dark" ? "text-sand/70" : "text-stone")}>
            WhatsApp Business Automation
          </span>
        ) : null}
      </span>
    </span>
  );
}
