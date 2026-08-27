import type { Money, RiskPriority, TransactionId } from "@recoverai/core";

export interface PrioritizationCustomerHistoryInput {
  readonly totalTransactions: number;
  readonly successfulTransactions: number;
  readonly reliabilityScore: number;
}

/**
 * Everything the Prioritization stage reasons over. Deliberately does not
 * recompute `riskScore`/`recoverabilityScore`/`priority` — those are the
 * deterministic risk-scoring engine's job (`@recoverai/analysis`'s
 * `scoreTransaction()`, reused as-is) and are passed in already computed.
 * This stage only explains and packages that existing signal into a
 * bounded, auditable `PrioritizationResult` — it does not re-derive it.
 */
export interface PrioritizationInput {
  readonly transactionId: TransactionId;
  readonly amount: Money;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: Money;
  /** Already computed by `scoreTransaction()` — the authoritative priority tier; this stage packages it, never recomputes it. */
  readonly priority: RiskPriority;
  readonly retryable: boolean;
  readonly attemptCount: number;
  readonly customerHistory?: PrioritizationCustomerHistoryInput;
}
