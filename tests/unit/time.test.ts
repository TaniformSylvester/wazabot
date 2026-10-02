import { describe, expect, it } from "vitest";

import { localDate, localStamp, localTime } from "@/lib/business/time";

describe("business-local time strings", () => {
  const at = new Date("2026-10-08T09:00:00Z");
  it("formats in the business's timezone (Douala is UTC+1)", () => {
    expect(localDate(at, "Africa/Douala")).toBe("2026-10-08");
    expect(localTime(at, "Africa/Douala")).toBe("10:00");
    expect(localStamp(at, "Africa/Douala")).toBe("2026-10-08T10:00");
  });
  it("rolls the date over with the timezone", () => {
    expect(localStamp(new Date("2026-10-08T23:30:00Z"), "Africa/Douala")).toBe("2026-10-09T00:30");
    expect(localStamp(new Date("2026-10-08T23:30:00Z"), "Africa/Abidjan")).toBe("2026-10-08T23:30");
  });
});
