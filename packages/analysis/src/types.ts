import type {
  FailureReasonCode,
  ISODateString,
  Money,
  RevenueRisk,
  RiskPriority,
  Transaction,
  TransactionStatus,
} from "@recoverai/core";

export type IngestionSourceFormat = "json" | "csv";

/**
 * A transaction as produced by the ingestion pipeline: a real
 * `@recoverai/core` `Transaction` (unchanged — the core domain stays
 * provider-neutral) decorated with a few ingestion-only convenience
 * fields. CSV-sourced records rarely carry full per-attempt detail, so
 * `attemptCount`/`lastAttemptAt`/`failureReasonCode` are stored directly
 * rather than derived from `attempts`, which may be empty.
 */
export interface NormalizedTransaction extends Transaction {
  readonly attemptCount: number;
  readonly lastAttemptAt: ISODateString;
  /** Best-known reason the most recent attempt failed, if any. */
  readonly failureReasonCode?: FailureReasonCode;
  /** Where this record came from, e.g. "json:transactions.json". */
  readonly source: string;
}

export interface IngestionIssue {
  /** 1-based position of the offending record within the source file. */
  readonly row: number;
  readonly reason: string;
  /** The record's own id, when it could be read — never full record contents (avoids leaking customer data into logs). */
  readonly recordId?: string;
}

export interface IngestionSummary {
  readonly file: string;
  readonly format: IngestionSourceFormat;
  readonly totalRecords: number;
  readonly validRecords: number;
  readonly invalidRecords: number;
  /** Sum of amounts across every valid record, regardless of status. */
  readonly totalGmv: Money;
  readonly statusBreakdown: Readonly<Partial<Record<TransactionStatus, number>>>;
  /** Capped list of the first few validation failures, for actionable feedback. */
  readonly issues: readonly IngestionIssue[];
}

/**
 * A failed/abandoned transaction is a "recovery candidate." Rather than
 * inventing a parallel type, a candidate IS a `RevenueRisk` — see its
 * doc comment in `@recoverai/core`.
 */
export type RecoveryCandidate = RevenueRisk;

export type FailureBreakdown = Readonly<Partial<Record<FailureReasonCode, number>>>;
export type PriorityBreakdown = Readonly<Record<RiskPriority, number>>;

export interface RevenueSummary {
  readonly totalGmv: Money;
  readonly successfulAmount: Money;
  readonly revenueAtRiskAmount: Money;
  /** Sum of `expectedRecoveryAmount` across all candidates — an estimate, not a guarantee, and never actual recovered revenue. */
  readonly estimatedRecoverableAmount: Money;
}

/**
 * The deterministic "Risk Analysis Result" boundary object: everything a
 * dashboard, report, or future AI agent needs, computed once from ingested
 * transactions. No field here represents money that has actually been
 * recovered — recovery execution is a later phase.
 */
export interface AnalysisResult {
  readonly transactionCount: number;
  readonly statusBreakdown: Readonly<Partial<Record<TransactionStatus, number>>>;
  readonly revenue: RevenueSummary;
  readonly failureBreakdown: FailureBreakdown;
  readonly priorityBreakdown: PriorityBreakdown;
  /** All recovery candidates, sorted by expected recovery amount (see risk/prioritization.ts). */
  readonly candidates: readonly RecoveryCandidate[];
  readonly generatedAt: ISODateString;
}
