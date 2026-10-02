import { describe, expect, it } from "vitest";

import { usageLevel } from "@/lib/billing/usage";

describe("usageLevel (AI allowance warnings)", () => {
  it("is ok below 80% of the allowance", () => {
    expect(usageLevel(0, 50)).toBe("ok");
    expect(usageLevel(39, 50)).toBe("ok");
  });
  it("warns from 80%", () => {
    expect(usageLevel(40, 50)).toBe("warning");
    expect(usageLevel(4, 5)).toBe("warning");
  });
  it("is reached at the allowance (and a zero allowance is always reached)", () => {
    expect(usageLevel(50, 50)).toBe("reached");
    expect(usageLevel(51, 50)).toBe("reached");
    expect(usageLevel(0, 0)).toBe("reached");
  });
});
