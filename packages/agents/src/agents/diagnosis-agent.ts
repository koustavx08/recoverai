import type { FailureReason, Transaction } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

/**
 * Stage 2: determines *why* a transaction failed and whether that failure
 * category is generally recoverable.
 */
export interface DiagnosisAgent {
  readonly id: string;
  diagnose(
    transaction: Transaction,
    context: AgentContext,
  ): Promise<AgentOutcome<FailureReason>>;
}
