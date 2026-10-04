import "server-only";

import { PLANS } from "@/config/economics";
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

/** Every plan in config/economics.ts at its full allowance, against the most expensive industry at that volume. */
export async function planChecks(): Promise<(PlanCheck & { volume: VolumeResult })[]> {
  const out = [];
  for (const plan of PLANS) {
    const volume = await volumeSimulation(plan.aiConversationsPerMonth);
    out.push({
      ...checkPlan({
        planId: plan.id,
        price: plan.monthlyPrice,
        conversations: plan.aiConversationsPerMonth,
        costPerConversation: volume.worst.costPerConversationFcfa,
        repliesPerConversation: volume.worst.repliesPerConversation,
      }),
      volume,
    });
  }
  return out;
}
