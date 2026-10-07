"use client";

import { useRef } from "react";

/** The reports period form: editing a date switches the period to "Custom dates". */
export function ReportPeriodForm({ action, children }: { action: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2"
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        const range = ref.current?.elements.namedItem("range") as HTMLSelectElement | null;
        if (range && (target.name === "from" || target.name === "to")) range.value = "custom";
      }}
    >
      {children}
    </form>
  );
}
