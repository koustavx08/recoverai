import type { Money, RecoveryOutcome, RecoveryStrategyType, RiskPriority } from "@recoverai/core";
import type { DiagnosisCategory } from "../diagnosis/schema.js";
import type { PipelineResult } from "./pipeline-types.js";

const RECOVERY_OUTCOME_VALUES: readonly RecoveryOutcome[] = [
  "success",
  "failure",
  "pending",
  "blocked",
  "not_executed",
];

/**
 * Deterministic, portfolio-level aggregation over a batch of
 * `PipelineResult`s. Every number here is computed from the actual results
 * — nothing hardcoded, nothing estimated beyond what the individual
 * pipeline runs already produced. `simulatedRecoveredAmount` and
 * `simulationRecoveryRate` are explicitly named to make clear they are
 * SIMULATED — there is no `realRecoveredAmount` anywhere in this codebase.
 */
export interface PortfolioMetrics {
  readonly totalTransactions: number;
  /** Transactions Detection found to be a revenue-risk event at all (detected === true), whether or not they were actionable. */
  readonly failedTransactions: number;
  readonly actionableTransactions: number;
  readonly blockedTransactions: number;
  readonly skippedTransactions: number;
  readonly completedTransactions: number;
  /** Pipeline runs where verification failed or an internal error occurred — a pipeline-execution failure, distinct from a *simulated* recovery failure (see executionBreakdown.failure). */
  readonly failedPipelineRuns: number;
  readonly priorityBreakdown: Readonly<Record<RiskPriority, number>>;
  readonly diagnosisBreakdown: Readonly<Partial<Record<DiagnosisCategory, number>>>;
  readonly strategyBreakdown: Readonly<Partial<Record<RecoveryStrategyType, number>>>;
  readonly executionBreakdown: Readonly<Record<RecoveryOutcome, number>>;
  readonly revenueAtRisk: Money;
  readonly simulatedRecoveredAmount: Money;
  /** 0–100. `simulatedRecoveredAmount / revenueAtRisk`, guarded against a zero denominator. Always a SIMULATED figure — never real recovered revenue. */
  readonly simulationRecoveryRate: number;
  readonly verificationPassed: number;
  readonly verificationFailed: number;
}

export function computePortfolioMetrics(results: readonly PipelineResult[]): PortfolioMetrics {
  const priorityBreakdown: Record<RiskPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const diagnosisBreakdown: Partial<Record<DiagnosisCategory, number>> = {};
  const strategyBreakdown: Partial<Record<RecoveryStrategyType, number>> = {};
  const executionBreakdown: Record<RecoveryOutcome, number> = Object.fromEntries(
    RECOVERY_OUTCOME_VALUES.map((outcome) => [outcome, 0]),
  ) as Record<RecoveryOutcome, number>;

  let failedTransactions = 0;
  let actionableTransactions = 0;
  let blockedTransactions = 0;
  let skippedTransactions = 0;
  let completedTransactions = 0;
  let failedPipelineRuns = 0;
  let revenueAtRiskAmount = 0;
  let simulatedRecoveredAmountAmount = 0;
  let verificationPassed = 0;
  let verificationFailed = 0;
  let currency = "INR";

  for (const result of results) {
    if (result.status === "blocked") blockedTransactions++;
    else if (result.status === "skipped") skippedTransactions++;
    else if (result.status === "completed") completedTransactions++;
    else if (result.status === "failed") failedPipelineRuns++;

    if (result.detection?.result.detected) {
      failedTransactions++;
      if (result.detection.result.actionable) actionableTransactions++;
      // DetectionResult.metadata always carries the transaction's amount
      // (see deterministic-detection.ts) — reused here rather than adding
      // a redundant `amount` field to PipelineResult itself.
      const amount = result.detection.result.metadata.amount;
      if (typeof amount === "number") revenueAtRiskAmount += amount;
    }

    if (result.prioritization) {
      priorityBreakdown[result.prioritization.result.priority] += 1;
    }
    if (result.diagnosis) {
      const category = result.diagnosis.diagnosis.category;
      diagnosisBreakdown[category] = (diagnosisBreakdown[category] ?? 0) + 1;
    }
    if (result.strategy) {
      const strategy = result.strategy.decision.strategy;
      strategyBreakdown[strategy] = (strategyBreakdown[strategy] ?? 0) + 1;
    }
    if (result.execution) {
      executionBreakdown[result.execution.result.outcome] += 1;
      currency = result.execution.result.recoveredAmount.currency;
      simulatedRecoveredAmountAmount += result.execution.result.recoveredAmount.amount;
    }
    if (result.verification) {
      if (result.verification.verification.verified) verificationPassed++;
      else verificationFailed++;
    }
  }

  return {
    totalTransactions: results.length,
    failedTransactions,
    actionableTransactions,
    blockedTransactions,
    skippedTransactions,
    completedTransactions,
    failedPipelineRuns,
    priorityBreakdown,
    diagnosisBreakdown,
    strategyBreakdown,
    executionBreakdown,
    revenueAtRisk: { amount: revenueAtRiskAmount, currency },
    simulatedRecoveredAmount: { amount: simulatedRecoveredAmountAmount, currency },
    simulationRecoveryRate:
      revenueAtRiskAmount > 0 ? (simulatedRecoveredAmountAmount / revenueAtRiskAmount) * 100 : 0,
    verificationPassed,
    verificationFailed,
  };
}
