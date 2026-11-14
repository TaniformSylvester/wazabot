"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Tabs for the business types (Shops, Restaurants, Schools). Every panel is
 * rendered on the server (search engines and visitors without JavaScript get
 * all three, the first one shown); this only switches which one is visible.
 * Keyboard: arrows, Home and End move between tabs (WAI-ARIA tabs pattern).
 */
export function VerticalTabs({ label, tabs, panels }: { label: string; tabs: { key: string; label: string; icon: React.ReactNode }[]; panels: React.ReactNode[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="mx-auto flex w-full max-w-md gap-1 rounded-full border border-line bg-white p-1 shadow-card" data-testid="showcase-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`showcase-tab-${t.key}`}
            aria-selected={active === i}
            aria-controls={`showcase-panel-${t.key}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(i + 1);
              else if (e.key === "ArrowLeft") go(i - 1);
              else if (e.key === "Home") go(0);
              else if (e.key === "End") go(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
              active === i ? "bg-deep text-white" : "text-deep hover:bg-mint",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={tabs[i].key} role="tabpanel" id={`showcase-panel-${tabs[i].key}`} aria-labelledby={`showcase-tab-${tabs[i].key}`} hidden={active !== i} tabIndex={0} className="mt-10 focus:outline-none">
          {p}
        </div>
      ))}
    </div>
  );
}
