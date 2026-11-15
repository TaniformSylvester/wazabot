import { describe, expect, it } from "vitest";

import { TRIAL_BANNER_HIDE_MS, hideTrialBanner, trialBannerDismissible, trialBannerHidden } from "@/lib/billing/trial-banner";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const now = Date.UTC(2026, 10, 15, 9);

describe("trial banner", () => {
  it("hides for a day, for that business only", () => {
    const v = hideTrialBanner(undefined, A, now);
    expect(trialBannerHidden(v, A, 10, now)).toBe(true);
    expect(trialBannerHidden(v, B, 10, now)).toBe(false);
    expect(trialBannerHidden(v, A, 10, now + TRIAL_BANNER_HIDE_MS + 1)).toBe(false);
  });

  it("can't be hidden in the last 3 days", () => {
    expect(trialBannerDismissible(4)).toBe(true);
    expect(trialBannerDismissible(3)).toBe(false);
    expect(trialBannerHidden(hideTrialBanner(undefined, A, now), A, 3, now)).toBe(false);
  });

  it("keeps other businesses and drops expired or invalid entries", () => {
    const v = hideTrialBanner(`${B}~${now + 1000}.junk~5.${A}~${now - 1}`, A, now);
    expect(v.split(".")).toHaveLength(2);
    expect(trialBannerHidden(v, B, 10, now)).toBe(true);
  });
});
