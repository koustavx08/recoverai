import type { RecoveryStrategy, RevenueRisk, Transaction } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

/**
 * Stage 4: selects the recovery strategy most likely to recoup the
 * transaction, given its risk assessment.
 */
export interface StrategyAgent {
  readonly id: string;
  selectStrategy(
    transaction: Transaction,
    risk: RevenueRisk,
    context: AgentContext,
  ): Promise<AgentOutcome<RecoveryStrategy>>;
}
