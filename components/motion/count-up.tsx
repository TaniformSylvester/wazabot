"use client";

import { useEffect, useState } from "react";

import { useInView } from "./use-in-view";

/** Counts a number up from 0 when it scrolls into view (final value under reduced motion). */
export function CountUp({
  value,
  suffix = "",
  duration = 1100,
  className,
}: {
  value: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.5);
  const [display, setDisplay] = useState<number | null>(null);

  useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ opacity: inView ? 1 : 0, transition: "opacity 0.3s ease" }}
    >
      {display ?? value}
      {suffix}
    </span>
  );
}
