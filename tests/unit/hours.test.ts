import { describe, expect, it } from "vitest";

import { DEFAULT_OPENING_HOURS, isOpenAt, parseOpeningHours } from "@/lib/business/hours";

// 2026-09-30 is a Wednesday. Africa/Douala is UTC+1.
const at = (utc: string) => new Date(`2026-09-30T${utc}:00Z`);

describe("opening hours", () => {
  it("uses the business timezone", () => {
    expect(isOpenAt(DEFAULT_OPENING_HOURS, "Africa/Douala", at("06:59"))).toBe(false); // 07:59 local
    expect(isOpenAt(DEFAULT_OPENING_HOURS, "Africa/Douala", at("07:00"))).toBe(true); // 08:00 local
    expect(isOpenAt(DEFAULT_OPENING_HOURS, "Africa/Douala", at("16:59"))).toBe(true);
    expect(isOpenAt(DEFAULT_OPENING_HOURS, "Africa/Douala", at("17:00"))).toBe(false); // 18:00 local
  });

  it("handles closed days, past-midnight closing and unknown hours", () => {
    expect(isOpenAt({ wed: { closed: true, open: "08:00", close: "18:00" } }, "UTC", at("12:00"))).toBe(false);
    const bar = { tue: { closed: false, open: "18:00", close: "02:00" }, wed: { closed: true, open: "00:00", close: "00:00" } };
    expect(isOpenAt(bar, "UTC", at("01:30"))).toBe(true);
    expect(isOpenAt(bar, "UTC", at("03:00"))).toBe(false);
    expect(isOpenAt({}, "Africa/Douala", at("12:00"))).toBeNull();
  });

  it("drops malformed stored values", () => {
    expect(parseOpeningHours({ mon: { closed: false, open: "8am", close: "18:00" }, tue: { closed: true, open: "08:00", close: "18:00" } })).toEqual({
      tue: { closed: true, open: "08:00", close: "18:00" },
    });
    expect(parseOpeningHours("nope")).toEqual({});
  });
});
