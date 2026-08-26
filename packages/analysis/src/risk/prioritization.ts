import type { RevenueRisk, RiskPriority } from "@recoverai/core";
import type { PriorityBreakdown } from "../types.js";

/**
 * Sorts recovery candidates primarily by expected recovery amount (the
 * money-weighted view of "what's worth doing first"), using risk and then
 * recoverability as tie-breakers.
 */
export function sortCandidates(
  candidates: readonly RevenueRisk[],
): readonly RevenueRisk[] {
  return [...candidates].sort((a, b) => {
    if (b.expectedRecoveryAmount.amount !== a.expectedRecoveryAmount.amount) {
      return b.expectedRecoveryAmount.amount - a.expectedRecoveryAmount.amount;
    }
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.recoverabilityScore - a.recoverabilityScore;
  });
}

export function computePriorityBreakdown(
  candidates: readonly RevenueRisk[],
): PriorityBreakdown {
  const counts: Record<RiskPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const candidate of candidates) counts[candidate.priority] += 1;
  return counts;
}
