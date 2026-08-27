import type { Money, RiskPriority, TransactionId } from "@recoverai/core";
import type { Diagnosis } from "../diagnosis/schema.js";

/**
 * Everything the Strategy Agent is allowed to reason over for one
 * transaction: the already-produced, already-validated `Diagnosis` plus the
 * deterministic risk/prioritization context that followed it. This is a
 * flat DTO, deliberately not re-deriving anything from raw transaction
 * data — Strategy Selection sits strictly downstream of Diagnosis in the
 * architecture (Transaction -> Deterministic Intelligence -> Grounded
 * Diagnosis -> Revenue Risk -> Strategy Selection), so it never sees the
 * transaction directly, only what Diagnosis and risk-scoring already
 * established. The caller (CLI service, web server action) builds this
 * from `@recoverai/analysis`'s output plus the `Diagnosis` produced by
 * `GroundedDiagnosisAgent`.
 */
export interface StrategyInput {
  readonly transactionId: TransactionId;
  readonly diagnosis: Diagnosis;
  readonly amount: Money;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: Money;
  readonly priority: RiskPriority;
  readonly attemptCount: number;
  /** Hard constraint carried over from the diagnosis stage's deterministic classification — never overridden by the model. */
  readonly retryable: boolean;
  /** Whether this customer has ever completed a payment with a different payment method than the one that just failed, if known. */
  readonly hasSucceededWithAlternateMethod?: boolean;
}
