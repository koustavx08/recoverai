import type { RecoveryActionId } from "@recoverai/core";
import type { RecoverySimulationResult } from "@recoverai/integrations";
import type { RecoveryExecutionPlan, RecoveryExecutionResult } from "./schema.js";
import type { SimulationProfile } from "./simulation-profile.js";
import type { RecoveryExecutionRequest } from "./types.js";

const ZERO_METADATA_KEYS = { simulated: true } as const;

function zeroAmount(currency: string): RecoveryExecutionResult["recoveredAmount"] {
  return { amount: 0, currency };
}

export function buildBlockedResult(
  request: RecoveryExecutionRequest,
  executionId: RecoveryActionId,
  blockedReason: string,
  now: Date,
): RecoveryExecutionResult {
  return {
    executionId,
    transactionId: request.transactionId,
    strategy: request.strategyDecision.strategy,
    action: "none",
    outcome: "blocked",
    recoveredAmount: zeroAmount(request.expectedRecoveryAmount.currency),
    simulationMode: true,
    executedAt: now.toISOString(),
    blockedReason,
    metadata: { ...ZERO_METADATA_KEYS, policyBlocked: true },
  };
}

export function buildNotExecutedResult(
  request: RecoveryExecutionRequest,
  plan: RecoveryExecutionPlan,
  now: Date,
): RecoveryExecutionResult {
  return {
    executionId: plan.executionId,
    transactionId: request.transactionId,
    strategy: plan.strategy,
    action: plan.action,
    outcome: "not_executed",
    recoveredAmount: zeroAmount(request.expectedRecoveryAmount.currency),
    simulationMode: true,
    executedAt: now.toISOString(),
    metadata: { ...ZERO_METADATA_KEYS, reason: "strategy is no_action" },
  };
}

export function buildPendingResult(
  request: RecoveryExecutionRequest,
  plan: RecoveryExecutionPlan,
  now: Date,
): RecoveryExecutionResult {
  return {
    executionId: plan.executionId,
    transactionId: request.transactionId,
    strategy: plan.strategy,
    action: plan.action,
    outcome: "pending",
    recoveredAmount: zeroAmount(request.expectedRecoveryAmount.currency),
    simulationMode: true,
    executedAt: now.toISOString(),
    metadata: {
      ...ZERO_METADATA_KEYS,
      reason: "requires human approval — no automated approval mechanism exists in this phase",
    },
  };
}

export function buildSimulatedResult(
  request: RecoveryExecutionRequest,
  plan: RecoveryExecutionPlan,
  simulation: RecoverySimulationResult,
  profile: SimulationProfile,
  now: Date,
): RecoveryExecutionResult {
  return {
    executionId: plan.executionId,
    transactionId: request.transactionId,
    strategy: plan.strategy,
    action: plan.action,
    outcome: simulation.succeeded ? "success" : "failure",
    recoveredAmount: simulation.succeeded
      ? request.expectedRecoveryAmount
      : zeroAmount(request.expectedRecoveryAmount.currency),
    simulationMode: true,
    executedAt: now.toISOString(),
    metadata: {
      simulated: true,
      probabilityOfSuccess: Number(profile.probabilityOfSuccess.toFixed(4)),
      roll: Number(simulation.roll.toFixed(4)),
    },
  };
}
