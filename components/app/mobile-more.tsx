"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * On phones (< 768 px): content folded behind a "More" toggle, so the
 * conversation drawer's header stays short. From 768 px: always shown.
 */
export function MobileMore({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-8 w-fit items-center gap-1 text-sm font-semibold text-waza-700 md:hidden"
        data-testid="drawer-more"
      >
        {label} <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} className={cn("flex-col gap-3 md:flex", open ? "flex" : "hidden", className)}>
        {children}
      </div>
    </>
  );
}
