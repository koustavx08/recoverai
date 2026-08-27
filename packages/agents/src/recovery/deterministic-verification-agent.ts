import type {
  RecoveryVerificationMeta,
  RecoveryVerificationOutcome,
  VerificationAgent,
} from "../agents/verification-agent.js";
import type { AgentContext } from "../agents/types.js";
import { verifyRecoveryExecution } from "./deterministic-verification.js";
import type { RecoveryExecutionResult } from "./schema.js";

/**
 * The Verification Agent: independently re-checks a `RecoveryExecutionResult`
 * for internal consistency (Task 9) — never trusting the Recovery Agent's
 * own report, and never using a model. Deliberately a separate class from
 * `SimulatedRecoveryAgent` so a bug in execution-result formatting can't
 * also corrupt its own verification.
 */
export class DeterministicVerificationAgent implements VerificationAgent {
  readonly id = "verification-agent";

  async verifyRecovery(
    result: RecoveryExecutionResult,
    context: AgentContext,
  ): Promise<RecoveryVerificationOutcome> {
    const startedAt = Date.now();
    const verification = verifyRecoveryExecution(result);

    context.logger.log(verification.verified ? "info" : "warn", "verification agent: checked recovery execution", {
      transactionId: result.transactionId,
      executionId: result.executionId,
      verified: verification.verified,
      reasons: verification.reasons,
    });

    const meta: RecoveryVerificationMeta = { latencyMs: Date.now() - startedAt };
    return { verification, meta };
  }
}
