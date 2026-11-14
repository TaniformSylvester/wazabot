import { describe, expect, it } from "vitest";

import { alertKey, newArrivals, queueChanged, seenFrom, titleWithCount, type HandoffItem } from "@/lib/handoffs/alerts";

const item = (id: string, at: string, requested = true): HandoffItem => ({ id, name: id.toUpperCase(), at, requested });

describe("live handoff queue", () => {
  it("the first look only sets the baseline: no alert for threads already waiting", () => {
    expect(newArrivals(null, [item("a", "2026-11-17T10:00:00Z")])).toEqual([]);
    expect(queueChanged(null, [item("a", "2026-11-17T10:00:00Z")])).toBe(false);
  });

  it("a new handoff, and a new customer message on a waiting thread, are alerts; nothing else is", () => {
    const prev = seenFrom([item("a", "2026-11-17T10:00:00Z"), item("b", "2026-11-17T10:05:00Z")]);
    const next = [item("a", "2026-11-17T10:00:00Z"), item("b", "2026-11-17T10:09:00Z"), item("c", "2026-11-17T10:10:00Z")];
    expect(newArrivals(prev, next).map((x) => `${x.item.id}:${x.kind}`)).toEqual(["b:message", "c:handoff"]);
    expect(queueChanged(prev, next)).toBe(true);
    expect(newArrivals(prev, [item("a", "2026-11-17T10:00:00Z"), item("b", "2026-11-17T10:05:00Z")])).toEqual([]);
  });

  it("a thread leaving the queue (resolved, or handed back to the assistant) changes it without an alert", () => {
    const prev = seenFrom([item("a", "2026-11-17T10:00:00Z"), item("b", "2026-11-17T10:05:00Z")]);
    const next = [item("a", "2026-11-17T10:00:00Z")];
    expect(newArrivals(prev, next)).toEqual([]);
    expect(queueChanged(prev, next)).toBe(true);
  });

  it("the tab title carries the count while threads wait, and loses it when none do", () => {
    expect(titleWithCount("Conversations | WazaBolt Dashboard", 2)).toBe("(2) Conversations | WazaBolt Dashboard");
    expect(titleWithCount("(2) Conversations | WazaBolt Dashboard", 3)).toBe("(3) Conversations | WazaBolt Dashboard");
    expect(titleWithCount("(3) Conversations | WazaBolt Dashboard", 0)).toBe("Conversations | WazaBolt Dashboard");
    expect(titleWithCount("WazaBolt", 120)).toBe("(99+) WazaBolt");
  });

  it("one alert key per thread and message", () => {
    expect(alertKey(item("a", "2026-11-17T10:00:00Z"))).toBe("a@2026-11-17T10:00:00Z");
  });
});
