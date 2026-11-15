import { describe, expect, it } from "vitest";

import { minutesLeft } from "@/components/app/handoff-countdown";

describe("handoff countdown", () => {
  const now = Date.parse("2026-11-19T10:00:00Z");
  it("whole minutes left, rounded up; at least 1 while time remains; 0 once it's up", () => {
    expect(minutesLeft("2026-11-19T10:18:00Z", now)).toBe(18);
    expect(minutesLeft("2026-11-19T10:17:01Z", now)).toBe(18);
    expect(minutesLeft("2026-11-19T10:00:20Z", now)).toBe(1);
    expect(minutesLeft("2026-11-19T10:00:00Z", now)).toBe(0);
    expect(minutesLeft("2026-11-19T09:59:00Z", now)).toBe(0);
  });
});
