import { brand } from "@recoverai/core";
import type {
  FailureReasonCode,
  ISODateString,
  TransactionStatus,
} from "@recoverai/core";
import { classifyFailure } from "./classification/index.js";
import {
  NEUTRAL_CUSTOMER_HISTORY,
  buildCustomerHistoryIndex,
  computePriorityBreakdown,
  scoreTransaction,
  sortCandidates,
} from "./risk/index.js";
import type {
  AnalysisResult,
  FailureBreakdown,
  NormalizedTransaction,
  RecoveryCandidate,
  RevenueSummary,
} from "./types.js";

/** Statuses that represent revenue currently at risk. Pending and refunded transactions are not (yet) a loss, so they're excluded from candidates. */
const RISK_ELIGIBLE_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  "failed",
  "abandoned",
]);

export interface AnalyzeOptions {
  /** Injected for determinism/testability — defaults to the real current time. */
  readonly now?: Date;
}

/**
 * The full deterministic transaction-intelligence pipeline: classify each
 * failed/abandoned transaction's failure reason, score its risk and
 * recoverability, and aggregate everything into a single `AnalysisResult`.
 * Pure given its inputs (including `now`) — no randomness, no model calls.
 */
export function analyzeTransactions(
  transactions: readonly NormalizedTransaction[],
  options: AnalyzeOptions = {},
): AnalysisResult {
  const now = options.now ?? new Date();
  const customerHistoryIndex = buildCustomerHistoryIndex(transactions);

  const statusBreakdown: Partial<Record<TransactionStatus, number>> = {};
  const failureBreakdown: Partial<Record<FailureReasonCode, number>> = {};
  const candidates: RecoveryCandidate[] = [];

  let totalGmvAmount = 0;
  let successfulAmount = 0;
  let revenueAtRiskAmount = 0;
  let currency = "INR";

  for (const transaction of transactions) {
    statusBreakdown[transaction.status] = (statusBreakdown[transaction.status] ?? 0) + 1;
    totalGmvAmount += transaction.amount.amount;
    currency = transaction.amount.currency;
    if (transaction.status === "succeeded") successfulAmount += transaction.amount.amount;

    if (!RISK_ELIGIBLE_STATUSES.has(transaction.status)) continue;

    revenueAtRiskAmount += transaction.amount.amount;
    const failureReason = classifyFailure(transaction);
    failureBreakdown[failureReason.code] =
      (failureBreakdown[failureReason.code] ?? 0) + 1;

    const customerHistory =
      customerHistoryIndex.get(transaction.customerId) ?? NEUTRAL_CUSTOMER_HISTORY;
    candidates.push(
      scoreTransaction(transaction, failureReason, customerHistory, { now }),
    );
  }

  const sortedCandidates = sortCandidates(candidates);
  const estimatedRecoverableAmount = candidates.reduce(
    (sum, candidate) => sum + candidate.expectedRecoveryAmount.amount,
    0,
  );

  const revenue: RevenueSummary = {
    totalGmv: { amount: totalGmvAmount, currency },
    successfulAmount: { amount: successfulAmount, currency },
    revenueAtRiskAmount: { amount: revenueAtRiskAmount, currency },
    estimatedRecoverableAmount: { amount: estimatedRecoverableAmount, currency },
  };

  return {
    transactionCount: transactions.length,
    statusBreakdown,
    revenue,
    failureBreakdown: failureBreakdown as FailureBreakdown,
    priorityBreakdown: computePriorityBreakdown(sortedCandidates),
    candidates: sortedCandidates,
    generatedAt: brand<string, "ISODateString">(now.toISOString()) as ISODateString,
  };
}
