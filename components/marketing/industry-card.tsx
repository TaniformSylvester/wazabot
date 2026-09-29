import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { iconTones, type IconTone } from "@/lib/brand/tones";
import { cn } from "@/lib/utils";

/** Compact, colourful industry tile (icon + name) linking to its solution. */
export function IndustryCard({ href, name, icon: Icon, tone }: { href: string; name: string; icon: LucideIcon; tone: IconTone }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col items-center gap-2.5 rounded-2xl border border-transparent p-3 text-center transition-colors hover:border-line hover:bg-white"
    >
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full ring-4 ring-white transition-transform duration-200 group-hover:-translate-y-1",
          iconTones[tone],
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="text-xs font-semibold text-deep sm:text-sm">{name}</span>
    </Link>
  );
}
