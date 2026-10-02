"use client";

import { useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";

import { switchBusiness } from "@/lib/actions/team";
import type { Locale } from "@/lib/i18n/config";

/** For people who belong to several businesses (e.g. invited into a client's team). */
export function BusinessSwitcher({
  current,
  businesses,
  locale,
  label,
}: {
  current: string;
  businesses: { id: string; name: string }[];
  locale: Locale;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="relative inline-flex max-w-full items-center">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => switchBusiness(id, locale));
        }}
        className="max-w-full cursor-pointer appearance-none truncate rounded-lg bg-transparent py-0.5 pl-1 pr-6 font-display text-base font-bold text-deep outline-none [field-sizing:content] hover:bg-surface focus-visible:ring-2 focus-visible:ring-waza-500"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-1 size-4 text-slate" aria-hidden />
    </label>
  );
}
