import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

/**
 * Stage 6: independently confirms whether a recovery action actually
 * recovered revenue, rather than trusting the recovery agent's own report.
 */
export interface VerificationAgent {
  readonly id: string;
  verifyRecovery(
    action: RecoveryAction,
    context: AgentContext,
  ): Promise<AgentOutcome<RecoveryResult>>;
}
