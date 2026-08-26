import type { Transaction } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

export interface DetectionResult {
  /** Whether this transaction represents revenue at risk worth analyzing further. */
  readonly isAtRisk: boolean;
}

/**
 * Stage 1: scans an incoming transaction and decides whether it represents
 * a revenue-loss event that the rest of the pipeline should process.
 */
export interface DetectionAgent {
  readonly id: string;
  detect(
    transaction: Transaction,
    context: AgentContext,
  ): Promise<AgentOutcome<DetectionResult>>;
}
