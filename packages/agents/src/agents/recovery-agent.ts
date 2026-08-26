import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { AgentContext, AgentOutcome } from "./types.js";

/**
 * Stage 5: executes a concrete `RecoveryAction` (e.g. via a
 * `RecoveryActionProvider` from @recoverai/integrations).
 */
export interface RecoveryAgent {
  readonly id: string;
  executeRecovery(
    action: RecoveryAction,
    context: AgentContext,
  ): Promise<AgentOutcome<RecoveryResult>>;
}
