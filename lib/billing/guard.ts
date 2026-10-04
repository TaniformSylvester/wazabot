import { BUDGET_HANDOVER_AT, BUDGET_PACE_MIN_SHARE, BUDGET_SAVER_AT, MAX_AI_REPLIES_PER_CONVERSATION } from "@/config/economics";

/*
 * What the assistant may spend on one customer message (Step 4). Pure: the
 * pipeline loads the facts, this decides.
 *
 *   normal      Claude as configured
 *   saver       Claude with short replies and less history; the rules layer
 *               answers a little more (budget running ahead of the month)
 *   rules_only  the rules layer answers what it can; everything else goes to
 *               the team (never dropped)
 *     plan_limit       a new AI conversation over the plan's allowance
 *     budget           the hidden Claude budget is used up
 *     budget_handover  nearly used up: new conversations go to the team
 *     reply_cap        MAX_AI_REPLIES_PER_CONVERSATION Claude replies in this
 *                      conversation's 24-hour window: handed to the team
 */

export type Allowance = { mode: "normal" } | { mode: "saver" } | { mode: "rules_only"; reason: "plan_limit" | "budget" | "budget_handover" | "reply_cap" };

export type GuardInput = {
  /** AI conversations used / included this usage month. */
  used: number;
  limit: number;
  /** Claude replies already in this conversation's open 24-hour window (null: no open window). */
  windowClaudeReplies: number | null;
  /** Under the pre-Step 4 rules: the assistant already answered this conversation this month. */
  legacyAnswered: boolean;
  counting: "legacy" | "windows";
  /** Claude spend this usage month and the hidden budget (FCFA). */
  spent: number;
  budget: number;
  /** Share of the usage month gone (0–1). */
  elapsed: number;
};

export function decideAllowance(i: GuardInput): Allowance {
  const ongoing = i.counting === "legacy" ? i.legacyAnswered : (i.windowClaudeReplies ?? 0) > 0;
  if ((i.windowClaudeReplies ?? 0) >= MAX_AI_REPLIES_PER_CONVERSATION) return { mode: "rules_only", reason: "reply_cap" };
  if (!ongoing && i.used >= i.limit) return { mode: "rules_only", reason: "plan_limit" };
  if (i.budget > 0) {
    const share = i.spent / i.budget;
    if (share >= 1) return { mode: "rules_only", reason: "budget" };
    if (share >= BUDGET_HANDOVER_AT && !ongoing) return { mode: "rules_only", reason: "budget_handover" };
    if (share >= BUDGET_SAVER_AT || (share >= BUDGET_PACE_MIN_SHARE && share > i.elapsed)) return { mode: "saver" };
  }
  return { mode: "normal" };
}

/** Share of a period gone at `now` (0–1). */
export function elapsedShare(start: string, end: string, now: Date): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!(e > s)) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - s) / (e - s)));
}
