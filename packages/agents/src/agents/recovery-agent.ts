import type { RecoveryExecutionResult } from "../recovery/schema.js";
import type { RecoveryExecutionRequest } from "../recovery/types.js";
import type { AgentContext } from "./types.js";

export interface RecoveryExecutionMeta {
  readonly latencyMs: number;
  /** Literal `true` in this phase — see docs/agent-architecture.md's simulation-only boundary. */
  readonly simulationMode: true;
}

export interface RecoveryExecutionOutcome {
  readonly result: RecoveryExecutionResult;
  readonly meta: RecoveryExecutionMeta;
}

/**
 * Stage 5: turns a validated `StrategyDecision` into a bounded, policy-
 * checked recovery attempt. In this phase every execution is a simulation —
 * see `../recovery/` for the concrete `SimulatedRecoveryAgent`
 * implementation. Never executes a real payment, message, or retry; never
 * bypasses `RecoveryExecutionPolicy`; never claims money was recovered
 * before independent verification (`VerificationAgent`).
 */
export interface RecoveryAgent {
  readonly id: string;
  executeRecovery(
    request: RecoveryExecutionRequest,
    context: AgentContext,
  ): Promise<RecoveryExecutionOutcome>;
}
