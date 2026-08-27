import { randomUUID } from "node:crypto";
import { brand, type RecoveryActionId } from "@recoverai/core";
import { mapStrategyToAction } from "./action-mapping.js";
import type { RecoveryExecutionPlan } from "./schema.js";
import type { RecoveryExecutionRequest } from "./types.js";

/** Attempts at or above this cap block any further automatic retry-based action — mirrors the Strategy Policy's own cap (Phase 4) as defense in depth, not a re-derivation of it. */
export const RECOVERY_MAX_RETRY_ATTEMPTS = 3;

const RETRY_ACTIONS = new Set(["auto_retry"]);

export type RecoveryPolicyDecision =
  | { readonly allowed: true; readonly plan: RecoveryExecutionPlan }
  | {
      readonly allowed: false;
      readonly executionId: RecoveryActionId;
      readonly blockedReason: string;
      readonly constraints: readonly string[];
    };

/**
 * `RecoveryExecutionPolicy.canExecute()` — the single gate every recovery
 * attempt passes through before any simulation runs. Every check here is
 * deterministic and re-validates what upstream stages (Diagnosis, Strategy)
 * should have already guaranteed — defense in depth, never trusting that a
 * `RecoveryExecutionRequest` was necessarily built correctly by its caller.
 * The execution engine (`SimulatedRecoveryAgent`) must never override what
 * this returns.
 */
export function canExecute(request: RecoveryExecutionRequest): RecoveryPolicyDecision {
  const executionId: RecoveryActionId = brand(randomUUID());
  const { strategyDecision, diagnosis } = request;
  const strategy = strategyDecision.strategy;
  const action = mapStrategyToAction(strategy);
  const constraints: string[] = [];

  if (!request.executionContext.simulationMode) {
    return {
      allowed: false,
      executionId,
      blockedReason: "Live execution is not implemented — this phase only supports simulation mode.",
      constraints: [],
    };
  }

  // manual_review is a decision to defer to a human, not an action to carry
  // out — it is never executed, simulated or otherwise.
  if (strategy === "manual_review") {
    return {
      allowed: false,
      executionId,
      blockedReason: "Strategy is manual_review — requires human review before any action can be taken.",
      constraints: [],
    };
  }

  const nonRetryable = diagnosis.category === "non_retryable" || !diagnosis.retryRecommendation.recommended;
  if (RETRY_ACTIONS.has(action) && nonRetryable) {
    return {
      allowed: false,
      executionId,
      blockedReason: "Diagnosis marks this failure as non-retryable — retry-based actions are blocked.",
      constraints: [],
    };
  }

  if (RETRY_ACTIONS.has(action) && request.attemptCount >= RECOVERY_MAX_RETRY_ATTEMPTS) {
    return {
      allowed: false,
      executionId,
      blockedReason: `Retry limit reached: ${request.attemptCount} attempt(s) already recorded (cap: ${RECOVERY_MAX_RETRY_ATTEMPTS}).`,
      constraints: [],
    };
  }

  if (strategyDecision.requiresHumanApproval) {
    constraints.push(
      "Strategy requires human approval — no automated approval mechanism exists in this phase, so this action is allowed to plan but will resolve as pending, not simulated to success/failure.",
    );
  }

  if (action === "none") {
    constraints.push("Strategy is no_action — nothing is executed.");
  }

  return {
    allowed: true,
    plan: {
      executionId,
      transactionId: request.transactionId,
      strategy,
      action,
      simulationMode: true,
      constraints,
      approvalRequired: strategyDecision.requiresHumanApproval,
    },
  };
}
