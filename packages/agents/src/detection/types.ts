import type { FailureReasonCode, Money, TransactionId, TransactionStatus } from "@recoverai/core";

/**
 * Everything the Detection stage is allowed to reason over for one
 * transaction. A flat DTO, not `@recoverai/analysis`'s
 * `NormalizedTransaction`/`FailureReason` — those types stay out of
 * `@recoverai/agents` on purpose (see docs/agent-architecture.md's
 * layering rule). The caller runs classification first (cheap and always
 * needed regardless of what Detection decides) and passes its result in,
 * so Detection can cheaply gate the more expensive stages (Diagnosis,
 * Strategy, Recovery) before they ever run.
 */
export interface DetectionInput {
  readonly transactionId: TransactionId;
  readonly status: TransactionStatus;
  readonly amount: Money;
  readonly attemptCount: number;
  /** Present only for failed/abandoned transactions — classification doesn't run for succeeded/pending/refunded ones. */
  readonly failureCode?: FailureReasonCode;
  readonly retryable?: boolean;
}
