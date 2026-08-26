import type { TransactionId, Money, ISODateString } from "../types/common.js";
import type {
  FailureReasonCode,
  RiskPriority,
  RecoveryStrategyType,
} from "../types/enums.js";

/** Structured explanation of why a transaction failed. */
export interface FailureReason {
  readonly code: FailureReasonCode;
  /** Human-readable summary suitable for merchant-facing display. */
  readonly description: string;
  /** Whether this failure category is generally considered recoverable. */
  readonly recoverable: boolean;
}

/**
 * The output of the risk-analysis engine for a single transaction: how much
 * revenue is at stake, how recoverable it is, and what should happen next.
 *
 * Scores are normalized to the 0–1 range so downstream consumers (UI,
 * agents, reports) don't need to know how they were computed.
 */
export interface RevenueRisk {
  readonly transactionId: TransactionId;
  /** 0 (no risk) – 1 (certain revenue loss). */
  readonly riskScore: number;
  /** 0 (unrecoverable) – 1 (highly recoverable). */
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: Money;
  readonly failureReason: FailureReason;
  readonly priority: RiskPriority;
  readonly recommendedStrategy: RecoveryStrategyType;
  /** Plain-language rationale, intended for audit trails and merchant UI. */
  readonly explanation: string;
  readonly assessedAt: ISODateString;
}
