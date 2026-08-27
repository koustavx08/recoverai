import type { RecoveryExecutionResult, RecoveryVerificationResult } from "./schema.js";

/**
 * Independently verifies one `RecoveryExecutionResult` — deterministic,
 * self-contained (only the result itself, no external state), and
 * completely separate from whatever code produced the result (Task 9:
 * "Verification must be independent from execution result formatting").
 * No LLM involved. Checks every "impossible state" the spec calls out
 * explicitly, plus the simulation-mode boundary this entire phase depends
 * on.
 */
export function verifyRecoveryExecution(result: RecoveryExecutionResult): RecoveryVerificationResult {
  const reasons: string[] = [];

  if (!result.executionId) {
    reasons.push("executionId is missing.");
  }
  if (!result.transactionId) {
    reasons.push("transactionId is missing.");
  }

  if (result.simulationMode !== true) {
    reasons.push("simulationMode must be true — live execution is not supported in this phase.");
  }

  if (result.outcome === "success") {
    if (!(result.recoveredAmount.amount > 0)) {
      reasons.push('outcome is "success" but recoveredAmount is not greater than zero.');
    }
  } else if (result.recoveredAmount.amount !== 0) {
    reasons.push(`outcome is "${result.outcome}" but recoveredAmount is non-zero.`);
  }

  if (result.outcome === "blocked" && !result.blockedReason) {
    reasons.push('outcome is "blocked" but no blockedReason was recorded.');
  }
  if (result.outcome !== "blocked" && result.blockedReason) {
    reasons.push(`blockedReason is set but outcome is "${result.outcome}", not "blocked".`);
  }

  return {
    executionId: result.executionId,
    transactionId: result.transactionId,
    verified: reasons.length === 0,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}
