import "server-only";

import { ADDONS, AI_TRIAL, BUNDLE_PRICES, PLANS } from "@/config/economics";
import { checkPlan, type PlanCheck } from "@/lib/billing/pricing";

import { runGeneralSimulation, runVolumeSimulation, type SimulationSummary, type VolumeResult } from "./run";

/*
 * Simulation results for the admin Pricing page. Deterministic (fixed seed),
 * so each result is computed once per server instance and reused.
 */

/** The calculator simulates any volume up to this many conversations a month. */
export const MAX_SIMULATED_VOLUME = 10_000;

let general: Promise<SimulationSummary> | null = null;
const volumes = new Map<number, Promise<VolumeResult>>();

export function generalSimulation() {
  general ??= runGeneralSimulation();
  return general;
}

export function volumeSimulation(conversationsPerMonth: number) {
  const n = Math.min(MAX_SIMULATED_VOLUME, Math.max(1, Math.round(conversationsPerMonth)));
  if (!volumes.has(n)) volumes.set(n, runVolumeSimulation(n));
  return volumes.get(n)!;
}

/**
 * The AI offers in config/economics.ts at their full allowance — each add-on
 * (its own price), each bundle (what it adds over the plan alone) and the AI
 * trial (no revenue: acquisition cost) — against the most expensive industry
 * at that volume. The plans themselves carry no AI cost.
 */
export function aiOffers(): { planId: string; price: number; conversations: number }[] {
  return [
    ...ADDONS.map((a) => ({ planId: a.id, price: a.monthlyPrice, conversations: a.conversationsPerMonth })),
    ...BUNDLE_PRICES.map((b) => {
      const plan = PLANS.find((p) => p.id === b.planId)!;
      const addon = ADDONS.find((a) => a.id === b.addonId)!;
      return { planId: `${b.planId}+${b.addonId}`, price: b.monthlyPrice - plan.monthlyPrice, conversations: addon.conversationsPerMonth };
    }),
    { planId: "ai_trial", price: 0, conversations: AI_TRIAL.conversations },
  ];
}

export async function planChecks(): Promise<(PlanCheck & { volume: VolumeResult })[]> {
  const out = [];
  for (const offer of aiOffers()) {
    const volume = await volumeSimulation(offer.conversations);
    out.push({
      ...checkPlan({
        ...offer,
        costPerConversation: volume.worst.costPerConversationFcfa,
        repliesPerConversation: volume.worst.repliesPerConversation,
      }),
      volume,
    });
  }
  return out;
}
