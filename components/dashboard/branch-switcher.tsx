"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";

import { switchBranch } from "@/lib/actions/branches";
import type { Locale } from "@/lib/i18n/config";
import { splitLocale } from "@/lib/i18n/paths";

/** Owners and admins of a business with several branches pick the branch they work in (stays on the same page). */
export function BranchSwitcher({ current, branches, locale, label }: { current: string; branches: { id: string; name: string }[]; locale: Locale; label: string }) {
  const [pending, startTransition] = useTransition();
  const path = splitLocale(usePathname()).path;
  return (
    <label className="relative inline-flex max-w-full items-center gap-1 text-xs text-slate" data-testid="branch-switcher">
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => switchBranch(id, locale, path));
        }}
        className="max-w-full cursor-pointer appearance-none truncate rounded bg-transparent py-0.5 pr-1 font-semibold text-slate outline-none [field-sizing:content] hover:text-deep focus-visible:ring-2 focus-visible:ring-waza-500"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
