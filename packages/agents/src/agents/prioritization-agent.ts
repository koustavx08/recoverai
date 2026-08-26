import type { FailureReason, RevenueRisk, Transaction } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

/**
 * Stage 3: scores and ranks an at-risk transaction — how much revenue is
 * at stake and how likely it is to be recoverable — producing the
 * `RevenueRisk` assessment consumed by the strategy stage and the UI.
 */
export interface PrioritizationAgent {
  readonly id: string;
  prioritize(
    transaction: Transaction,
    failureReason: FailureReason,
    context: AgentContext,
  ): Promise<AgentOutcome<RevenueRisk>>;
}
