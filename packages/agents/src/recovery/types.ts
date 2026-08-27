import type { Money, PaymentMethod, TransactionId } from "@recoverai/core";
import type { Diagnosis } from "../diagnosis/schema.js";
import type { StrategyDecision } from "../strategy/schema.js";

/**
 * Every field here is fixed at `true`/absent-by-default so that
 * constructing a "live" execution context requires deliberately widening
 * the type — there is no code path in this phase that can accidentally
 * produce one. See docs/agent-architecture.md's simulation-only boundary.
 */
export interface RecoveryExecutionContext {
  readonly simulationMode: true;
  /** Optional explicit seed override for reproducibility (e.g. the CLI's `--seed`); defaults to a seed derived from transactionId + strategy + action when omitted. */
  readonly seed?: string;
}

/**
 * Everything the Recovery Agent is allowed to act on for one transaction:
 * the already-produced, already-validated `Diagnosis` and `StrategyDecision`
 * plus the minimal transaction facts needed to build and simulate an
 * execution plan. Strategy Selection sits strictly upstream — the Recovery
 * Agent never re-derives a strategy, it only executes (in simulation) the
 * one it's given, after re-validating it against the deterministic
 * execution policy.
 */
export interface RecoveryExecutionRequest {
  readonly transactionId: TransactionId;
  readonly amount: Money;
  readonly paymentMethod: PaymentMethod;
  readonly attemptCount: number;
  readonly diagnosis: Diagnosis;
  readonly strategyDecision: StrategyDecision;
  /** The deterministic risk-scoring projection of what could be recovered — becomes `recoveredAmount` on a simulated success, per Task 8. Never a claim of actual recovered revenue. */
  readonly expectedRecoveryAmount: Money;
  readonly hasSucceededWithAlternateMethod?: boolean;
  readonly executionContext: RecoveryExecutionContext;
}
