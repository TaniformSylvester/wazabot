"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog (print or "Save as PDF"). */
export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer aria-hidden className="size-4" /> {label}
    </button>
  );
}
