import type {
  FailureReasonCode,
  Money,
  PaymentMethod,
  RiskPriority,
  TransactionId,
  TransactionStatus,
} from "@recoverai/core";
import type { DetectionOutcome } from "../agents/detection-agent.js";
import type { DiagnosisOutcome } from "../agents/diagnosis-agent.js";
import type { PrioritizationOutcome } from "../agents/prioritization-agent.js";
import type { RecoveryExecutionOutcome } from "../agents/recovery-agent.js";
import type { StrategyOutcome } from "../agents/strategy-agent.js";
import type { RecoveryVerificationOutcome } from "../agents/verification-agent.js";

export interface PipelineCustomerHistoryFacts {
  readonly totalTransactions: number;
  readonly successfulTransactions: number;
  readonly reliabilityScore: number;
}

/**
 * Everything `RecoveryPipeline.run()` needs for one transaction — a flat
 * DTO built by the caller (CLI/web), which has access to
 * `@recoverai/analysis`'s classification and risk-scoring (this package
 * deliberately does not — see docs/agent-architecture.md's layering rule).
 * `failureCode`/`retryable`/`riskScore`/`recoverabilityScore`/
 * `expectedRecoveryAmount`/`priority` are only defined for a
 * failed/abandoned transaction the caller has already run classification
 * and risk-scoring against; `run()` requires them once Detection marks a
 * transaction actionable (see `requireFailureContext` in
 * `recovery-pipeline.ts`) and throws a clear internal error if they're
 * missing at that point — a caller-contract violation, not a business
 * outcome.
 */
export interface PipelineTransactionFacts {
  readonly transactionId: TransactionId;
  readonly status: TransactionStatus;
  readonly amount: Money;
  readonly paymentMethod: PaymentMethod;
  readonly attemptCount: number;
  readonly failureCode?: FailureReasonCode;
  readonly failureDescription?: string;
  readonly retryable?: boolean;
  readonly riskScore?: number;
  readonly recoverabilityScore?: number;
  readonly expectedRecoveryAmount?: Money;
  readonly priority?: RiskPriority;
  readonly customerHistory?: PipelineCustomerHistoryFacts;
  readonly hasSucceededWithAlternateMethod?: boolean;
  /** Explicit simulation seed override for the Recovery stage, if any — same transaction + strategy + seed always reproduces the same simulated outcome. */
  readonly seed?: string;
}

/**
 * Bounded pipeline-level status — never an arbitrary string, and never a
 * thrown exception for an expected business outcome:
 * - `completed`: ran all the way through, including a resolved (success or
 *   failure) simulated recovery execution, and verification passed.
 * - `blocked`: the deterministic policy layer (Detection or the recovery
 *   execution policy) refused to proceed — non-retryable, retry limit,
 *   `manual_review`, or a strategy awaiting human approval (`pending`).
 * - `skipped`: nothing needed to happen — the transaction wasn't a
 *   revenue-risk event (Detection), or the strategy was `no_action`.
 * - `failed`: something went wrong — a stage threw, or independent
 *   verification found the execution result internally inconsistent.
 */
export type PipelineStatus = "completed" | "blocked" | "skipped" | "failed";

export interface PipelineMetadata {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly totalLatencyMs: number;
}

/**
 * The full, structured record of one transaction's run through
 * `RecoveryPipeline`. Every stage that actually ran is present; stages
 * skipped by an early stop condition are simply absent (not populated with
 * placeholder data) — `status`/`statusReason` always explain why.
 */
export interface PipelineResult {
  readonly transactionId: TransactionId;
  readonly status: PipelineStatus;
  readonly statusReason?: string;
  readonly detection?: DetectionOutcome;
  readonly prioritization?: PrioritizationOutcome;
  readonly diagnosis?: DiagnosisOutcome;
  readonly strategy?: StrategyOutcome;
  readonly execution?: RecoveryExecutionOutcome;
  readonly verification?: RecoveryVerificationOutcome;
  readonly metadata: PipelineMetadata;
}
