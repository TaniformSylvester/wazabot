"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

import { cn } from "@/lib/utils";

/** Whole minutes left (at least 1 while time remains); 0 once it's up. */
export function minutesLeft(expiresAt: string, now: number): number {
  const ms = Date.parse(expiresAt) - now;
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60_000)) : 0;
}

/**
 * "AI resumes in 18m" on a chat with the team (the handoff failsafe), ticking
 * every 30 s; "AI resumes at the next message" once the time is up. Shown only
 * where the assistant really answers.
 */
export function HandoffCountdown({
  expiresAt,
  labels,
  compact = false,
}: {
  expiresAt: string;
  labels: { resumesIn: string; resumesNext: string };
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  // The server's render has no clock of its own: count from the first client tick.
  const left = now === null ? null : minutesLeft(expiresAt, now);
  const text = left === null ? " " : left > 0 ? labels.resumesIn.replace("{minutes}", String(left)) : labels.resumesNext;
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1 rounded-full bg-surface font-semibold text-slate", compact ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-0.5 text-xs")}
      data-testid="handoff-countdown"
      data-minutes={left ?? ""}
      suppressHydrationWarning
    >
      <Timer className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}
