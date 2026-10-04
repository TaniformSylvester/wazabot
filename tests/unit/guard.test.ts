import { describe, expect, it } from "vitest";

import { MAX_AI_REPLIES_PER_CONVERSATION } from "@/config/economics";
import { decideAllowance, elapsedShare, type GuardInput } from "@/lib/billing/guard";

const base: GuardInput = { used: 10, limit: 30, windowClaudeReplies: null, legacyAnswered: false, counting: "windows", spent: 50, budget: 300, elapsed: 0.5 };

describe("what a reply may cost (Step 4)", () => {
  it("normal under the allowance and on pace with the budget", () => {
    expect(decideAllowance(base)).toEqual({ mode: "normal" });
  });

  it("a new AI conversation over the allowance: rules only; an ongoing one continues", () => {
    expect(decideAllowance({ ...base, used: 30 })).toEqual({ mode: "rules_only", reason: "plan_limit" });
    expect(decideAllowance({ ...base, used: 30, windowClaudeReplies: 2 })).toEqual({ mode: "normal" });
    // A rules-only window doesn't make it ongoing.
    expect(decideAllowance({ ...base, used: 30, windowClaudeReplies: 0 })).toEqual({ mode: "rules_only", reason: "plan_limit" });
    // Before Step 4's switch date: a conversation answered this month continues.
    expect(decideAllowance({ ...base, counting: "legacy", used: 50, limit: 50, legacyAnswered: true })).toEqual({ mode: "normal" });
  });

  it(`hands over after ${MAX_AI_REPLIES_PER_CONVERSATION} Claude replies in one conversation`, () => {
    expect(decideAllowance({ ...base, windowClaudeReplies: MAX_AI_REPLIES_PER_CONVERSATION - 1 })).toEqual({ mode: "normal" });
    expect(decideAllowance({ ...base, windowClaudeReplies: MAX_AI_REPLIES_PER_CONVERSATION })).toEqual({ mode: "rules_only", reason: "reply_cap" });
  });

  it("budget: saver when ahead of the month or past 80%, new conversations to the team at 95%, rules only at 100%", () => {
    // 30% spent, 10% of the month gone: ahead of pace.
    expect(decideAllowance({ ...base, spent: 90, elapsed: 0.1 })).toEqual({ mode: "saver" });
    // Under 20% spent: too early to judge the pace.
    expect(decideAllowance({ ...base, spent: 45, elapsed: 0.05 })).toEqual({ mode: "normal" });
    expect(decideAllowance({ ...base, spent: 240, elapsed: 0.9 })).toEqual({ mode: "saver" });
    expect(decideAllowance({ ...base, spent: 290, elapsed: 0.9 })).toEqual({ mode: "rules_only", reason: "budget_handover" });
    expect(decideAllowance({ ...base, spent: 290, elapsed: 0.9, windowClaudeReplies: 1 })).toEqual({ mode: "saver" });
    expect(decideAllowance({ ...base, spent: 300, windowClaudeReplies: 1 })).toEqual({ mode: "rules_only", reason: "budget" });
  });

  it("measures how much of the usage month is gone", () => {
    expect(elapsedShare("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", new Date("2026-10-16T12:00:00Z"))).toBeCloseTo(0.5, 2);
    expect(elapsedShare("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", new Date("2026-12-01T00:00:00Z"))).toBe(1);
  });
});
