import { useId } from "react";

import { cn } from "@/lib/utils";

type MarkProps = React.SVGProps<SVGSVGElement> & { title?: string };

/**
 * The WazaBot mark: a chat bubble carrying a bold "W", with a golden AI spark.
 * Drawn on a 48×48 grid with thick strokes so it still reads at 16–32px.
 */
export function LogoMark({ className, title, ...props }: MarkProps) {
  const id = useId();
  const gradient = `${id}-g`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("size-10", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradient} x1="6" y1="8" x2="36" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1FC985" />
          <stop offset="1" stopColor="#0C8354" />
        </linearGradient>
      </defs>
      <path
        d="M12 8h18a10 10 0 0 1 10 10v12a10 10 0 0 1-10 10H17.5l-7.4 5.7c-.9.7-2.1 0-2.1-1V39.2A10 10 0 0 1 2 30V18A10 10 0 0 1 12 8Z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M10.5 17.5 14.8 31l5.7-10.6L26.2 31l4.3-13.5"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M40.5 1c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z"
        fill="#FFC83D"
        stroke="#FFFDF8"
        strokeWidth="1.5"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** "light" backgrounds use a Deep Waza wordmark, "dark" backgrounds use white. */
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
};

const sizes = {
  sm: { mark: "size-8", word: "text-xl", tag: "text-[0.625rem]" },
  md: { mark: "size-10", word: "text-2xl", tag: "text-[0.6875rem]" },
  lg: { mark: "size-14", word: "text-4xl", tag: "text-sm" },
};

/** Horizontal logo: mark + "Waza" (dark) "Bot" (green) wordmark. */
export function Logo({ className, tone = "light", size = "md", withTagline = false }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={s.mark} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-heading font-extrabold tracking-tight", s.word)}>
          <span className={tone === "dark" ? "text-white" : "text-deep"}>Waza</span>
          <span className={tone === "dark" ? "text-waza-400" : "text-waza-600"}>Bot</span>
        </span>
        {withTagline ? (
          <span
            className={cn(
              "mt-1 font-medium",
              s.tag,
              tone === "dark" ? "text-white/70" : "text-slate-waza",
            )}
          >
            Your AI Receptionist on WhatsApp.
          </span>
        ) : null}
      </span>
    </span>
  );
}
