import type { LucideIcon } from "lucide-react";

import { WazaBoltBadge } from "@/components/brand/wazabolt-badge";
import { iconTones, type IconTone } from "@/lib/brand/tones";
import { cn } from "@/lib/utils";

export function FeatureCard({
  icon: Icon,
  title,
  text,
  tone = "green",
  status,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: IconTone;
  /** Use for anything not built yet — never present planned work as live. */
  status?: "Coming Soon" | "Planned";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex h-full gap-4 overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-waza-200 hover:shadow-float sm:block sm:p-6",
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-brand-gradient absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
      />
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", iconTones[tone])}>
        <Icon className="size-6" aria-hidden />
      </span>
      <div>
        <h3 className="type-h3 flex flex-wrap items-center gap-2 sm:mt-5">
          {title}
          {status ? <WazaBoltBadge tone="gold" icon={false} className="px-2 py-0.5 text-[0.625rem] uppercase tracking-wider">{status}</WazaBoltBadge> : null}
        </h3>
        <p className="type-body mt-1 text-slate sm:mt-2">{text}</p>
      </div>
    </div>
  );
}
