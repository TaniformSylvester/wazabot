import { describe, expect, it } from "vitest";

import { VERTICALS, VERTICAL_CONFIG, verticalOf } from "@/config/verticals";
import en from "@/messages/en";
import fr from "@/messages/fr";

describe("vertical dashboard config", () => {
  it("each vertical has three KPIs, a queue, four quick actions and a catalogue", () => {
    for (const v of VERTICALS) {
      const c = VERTICAL_CONFIG[v];
      expect(c.kpis).toHaveLength(3);
      expect(c.quickActions).toHaveLength(4);
      expect(c.queue.href).toMatch(/^\/dashboard/);
      expect(c.catalog.href).toMatch(/^\/dashboard/);
      for (const k of c.kpis) expect(["currency", "count", "percent"]).toContain(k.format);
    }
  });

  it("every key has its words in English and French (short and full action labels)", () => {
    for (const m of [en, fr]) {
      for (const v of VERTICALS) {
        const w = m.dashboard.verticals[v] as unknown as { kpis: Record<string, string>; actions: Record<string, { short: string; full: string }>; queueTitle: string; queueEmpty: string; catalogLabel: string };
        for (const k of VERTICAL_CONFIG[v].kpis) expect(w.kpis[k.key], `${v}.kpis.${k.key}`).toBeTruthy();
        for (const a of VERTICAL_CONFIG[v].quickActions) {
          expect(w.actions[a.key]?.short, `${v}.actions.${a.key}.short`).toBeTruthy();
          expect(w.actions[a.key]?.full, `${v}.actions.${a.key}.full`).toBeTruthy();
          // Short labels fit a half-width button on a 360 px phone.
          expect(w.actions[a.key].short.length, `${v}.actions.${a.key}.short`).toBeLessThanOrEqual(14);
        }
        expect(w.queueTitle && w.queueEmpty && w.catalogLabel).toBeTruthy();
      }
    }
  });

  it("catalogue names: Inventory, Menu Items, Programs", () => {
    expect([en.dashboard.verticals.shop.catalogLabel, en.dashboard.verticals.restaurant.catalogLabel, en.dashboard.verticals.school.catalogLabel]).toEqual(["Inventory", "Menu Items", "Programs"]);
  });

  it("a business's vertical follows its modules", () => {
    expect(verticalOf(["commerce", "docs", "ai"])).toBe("shop");
    expect(verticalOf(["commerce", "restaurant", "docs", "ai"])).toBe("restaurant");
    expect(verticalOf(["school", "docs", "ai"])).toBe("school");
    // A school that also sells (commerce on) uses the shop dashboard, with its school pages alongside.
    expect(verticalOf(["commerce", "school", "docs"])).toBe("shop");
  });
});
