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
              // Narrow phones (under 400px): no icons and less padding, so the three tabs fit in any language.
              "inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-1.5 text-xs font-semibold transition-colors min-[360px]:text-[0.8125rem] min-[400px]:px-3 min-[400px]:text-sm",
              active === i ? "bg-deep text-white" : "text-deep hover:bg-mint",
            )}
          >
            <span className="hidden min-[400px]:contents" aria-hidden>
              {t.icon}
            </span>
            <span className="truncate">{t.label}</span>
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
