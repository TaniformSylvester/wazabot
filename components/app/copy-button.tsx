"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A reference (CUS-000012, ORD-00045) with a button that copies it. `wrap`: a long value (a link) breaks across lines on small screens. */
export function CopyText({ value, label, copiedLabel, className, wrap = false }: { value: string; label: string; copiedLabel: string; className?: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={`${wrap ? "flex max-w-full items-start" : "inline-flex items-center whitespace-nowrap"} gap-1 ${className ?? ""}`}>
      <span className={`font-mono text-[0.8125rem] ${wrap ? "min-w-0 break-all pt-1" : ""}`}>{value}</span>
      <button
        type="button"
        aria-label={copied ? copiedLabel : label}
        title={copied ? copiedLabel : label}
        className="-my-1.5 inline-flex size-8 items-center justify-center rounded-md sm:my-0 sm:size-6 text-slate hover:bg-mint/60 hover:text-deep focus-visible:ring-2 focus-visible:ring-waza-500/40 focus-visible:outline-none print:hidden"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the reference can still be selected by hand.
          }
        }}
      >
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
