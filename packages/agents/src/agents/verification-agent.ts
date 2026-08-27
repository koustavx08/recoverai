import type { RecoveryExecutionResult, RecoveryVerificationResult } from "../recovery/schema.js";
import type { AgentContext } from "./types.js";

export interface RecoveryVerificationMeta {
  readonly latencyMs: number;
}

export interface RecoveryVerificationOutcome {
  readonly verification: RecoveryVerificationResult;
  readonly meta: RecoveryVerificationMeta;
}

/**
 * Stage 6: independently confirms whether a recovery execution attempt's
 * own reported outcome is internally consistent — rather than trusting the
 * recovery agent's own report. Deliberately separate from whatever code
 * produced the `RecoveryExecutionResult` (see `../recovery/
 * deterministic-verification.ts`) and never uses a model.
 */
export interface VerificationAgent {
  readonly id: string;
  verifyRecovery(
    result: RecoveryExecutionResult,
    context: AgentContext,
  ): Promise<RecoveryVerificationOutcome>;
}
