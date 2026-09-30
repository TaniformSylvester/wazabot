"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server-rendered page every few seconds while the tab is visible (new WhatsApp messages, delivery ticks). */
export function AutoRefresh({ seconds = 8, label }: { seconds?: number; label?: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return label ? (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate">
      <span className="size-1.5 animate-pulse rounded-full bg-waza-500" aria-hidden />
      {label}
    </span>
  ) : null;
}
