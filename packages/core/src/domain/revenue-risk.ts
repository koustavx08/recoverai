import type { TransactionId, Money, ISODateString } from "../types/common.js";
import type {
  FailureReasonCode,
  FailureSeverity,
  RiskPriority,
  RecoveryStrategyType,
} from "../types/enums.js";

/**
 * Structured explanation of why a transaction failed. This is also the
 * shape produced by a deterministic failure classifier (see
 * `@recoverai/analysis`) — `confidence`, `severity`, and `evidence` are
 * populated by rule-based classification logic, never by a model, so
 * "confidence" here means "how certain the rules are," not an LLM's
 * self-reported confidence.
 */
export interface FailureReason {
  readonly code: FailureReasonCode;
  /** Human-readable summary suitable for merchant-facing display. */
  readonly description: string;
  /** Whether this failure category is generally considered recoverable (i.e. retryable via some follow-up action). */
  readonly recoverable: boolean;
  /** How bad the failure is, independent of transaction value. */
  readonly severity: FailureSeverity;
  /** Deterministic classification confidence, 0–1 (rule-based, not an LLM's). */
  readonly confidence: number;
  /** Short, human-readable signals the classifier used to reach this conclusion. */
  readonly evidence: readonly string[];
}

/**
 * The output of the risk-analysis engine for a single transaction: how much
 * revenue is at stake, how recoverable it is, and what should happen next.
 * This is also the "RecoveryCandidate" the deterministic pipeline in
 * `@recoverai/analysis` produces for failed/abandoned transactions.
 *
 * Scores are normalized to 0–100 so downstream consumers (UI, agents,
 * reports) don't need to know how they were computed. `riskScore` and
 * `recoverabilityScore` are deliberately separate metrics: risk measures
 * how much revenue is at stake, recoverability measures how likely it is
 * that revenue can be recovered — a large transaction can be high-risk and
 * low-recoverability at the same time.
 */
export interface RevenueRisk {
  readonly transactionId: TransactionId;
  /** 0 (no risk) – 100 (severe, high-value revenue loss). */
  readonly riskScore: number;
  /** 0 (unrecoverable) – 100 (highly recoverable). */
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: Money;
  readonly failureReason: FailureReason;
  readonly priority: RiskPriority;
  readonly recommendedStrategy: RecoveryStrategyType;
  /** Plain-language rationale, intended for audit trails and merchant UI. */
  readonly explanation: string;
  readonly assessedAt: ISODateString;
}
