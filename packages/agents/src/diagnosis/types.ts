import type {
  FailureReasonCode,
  Money,
  PaymentMethod,
  TransactionId,
  TransactionStatus,
} from "@recoverai/core";

/**
 * Flat, deliberately vendor/package-agnostic snapshot of a customer's
 * payment reliability. This mirrors `@recoverai/analysis`'s
 * `CustomerHistory` in shape, but `packages/agents` must not depend on
 * `@recoverai/analysis` (see docs/agent-architecture.md's layering rule) —
 * callers (the CLI, the web app) map their own `CustomerHistory` into this
 * DTO at the integration boundary.
 */
export interface DiagnosisCustomerHistoryInput {
  readonly totalTransactions: number;
  readonly successfulTransactions: number;
  readonly reliabilityScore: number;
}

/**
 * Everything the Diagnosis Agent is allowed to reason over for one
 * transaction. This is a flat DTO, not `@recoverai/analysis`'s
 * `NormalizedTransaction`/`FailureReason`/`RevenueRisk` — those types stay
 * out of `@recoverai/agents` on purpose. The caller (CLI service, web
 * server action) is responsible for deriving these fields from the
 * deterministic ingestion/classification/risk-scoring pipeline before
 * calling `diagnose()`. Nothing beyond this object is available to either
 * the deterministic fallback or the LLM prompt — this is the complete set
 * of "facts."
 */
export interface DiagnosisInput {
  readonly transactionId: TransactionId;
  readonly amount: Money;
  readonly paymentMethod: PaymentMethod;
  readonly transactionStatus: TransactionStatus;
  readonly attemptCount: number;
  readonly failureCode: FailureReasonCode;
  readonly failureDescription: string;
  /** Whether the deterministic failure classifier considers this category retryable — a hard constraint the AI output must respect (see validation.ts). */
  readonly retryable: boolean;
  readonly riskScore?: number;
  readonly recoverabilityScore?: number;
  readonly expectedRecoveryAmount?: Money;
  readonly customerHistory?: DiagnosisCustomerHistoryInput;
}

export type TransactionValueClass = "low" | "medium" | "high";

/**
 * Output of the deterministic intelligence layer (Task 26): facts derived
 * directly from `DiagnosisInput` by pure, testable rules, with no model
 * call involved. Both the deterministic fallback and the LLM prompt are
 * built from this — the LLM never sees raw input without these signals
 * already having been computed for it.
 */
export interface DiagnosisFacts {
  readonly valueClass: TransactionValueClass;
  readonly isRepeatedFailure: boolean;
  readonly isNonRetryable: boolean;
  readonly isTimeout: boolean;
  readonly isUpiFailure: boolean;
  readonly isIssuerDecline: boolean;
  readonly isInsufficientFunds: boolean;
  readonly isCheckoutAbandonment: boolean;
  readonly isRefundRelated: boolean;
  readonly hasCustomerHistory: boolean;
  readonly previousSuccessfulPayments: number;
  readonly previousFailedPayments: number;
  /** Whether there is enough signal to support any diagnosis beyond "insufficient_evidence". */
  readonly evidenceSufficient: boolean;
}
