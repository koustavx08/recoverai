import { resolve } from "node:path";
import {
  buildCustomerHistoryIndex,
  classifyFailure,
  ingestFile,
  NEUTRAL_CUSTOMER_HISTORY,
  scoreTransaction,
  type NormalizedTransaction,
} from "@recoverai/analysis";
import {
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  buildStrategyPolicyContext,
  type DiagnosisInput,
  type DiagnosisOutcome,
  type StrategyInput,
  type StrategyOutcome,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { createInMemoryDatabase } from "@recoverai/database";
import { AnthropicProvider, type AIModelProvider } from "@recoverai/integrations";
import type {
  FailureReason,
  Logger,
  Money,
  RecoveryStrategyType,
  RevenueRisk,
} from "@recoverai/core";

const SAMPLE_DATA_PATH = resolve(process.cwd(), "../../data/samples/transactions.json");

/** No-op logger: the web app has no CLI stderr to write diagnostic lines to yet — server console is enough for now. */
const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[agent:${level}]`, message, context ?? {});
  },
};

export interface TransactionDiagnosisView {
  readonly transaction: NormalizedTransaction;
  readonly failureReason: FailureReason;
  readonly risk: RevenueRisk;
  readonly amount: Money;
  readonly outcome: DiagnosisOutcome;
  readonly strategyOutcome: StrategyOutcome;
  readonly allowedStrategies: readonly RecoveryStrategyType[];
  readonly strategyConstraints: readonly string[];
  readonly hasSucceededWithAlternateMethod: boolean;
}

function resolveProvider(): AIModelProvider | null {
  const config = loadConfig();
  return config.ai.isConfigured && config.ai.apiKey && config.ai.model
    ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
    : null;
}

/** Deterministic: has this customer ever succeeded with a different payment method than the one on the given transaction, within the same ingested batch? */
function hasSucceededWithAlternateMethod(
  transactions: readonly NormalizedTransaction[],
  transaction: NormalizedTransaction,
): boolean {
  return transactions.some(
    (t) =>
      t.customerId === transaction.customerId &&
      t.status === "succeeded" &&
      t.paymentMethod !== transaction.paymentMethod,
  );
}

/**
 * Server-only: runs the same ingestion -> classification -> risk-scoring ->
 * diagnosis -> strategy-selection pipeline the CLI's `agent --stage
 * diagnosis|strategy` commands use, against the bundled sample dataset, for
 * one transaction id. Returns `null` when the transaction isn't in the
 * dataset — the page renders a 404 in that case, nothing is fabricated.
 */
export async function loadTransactionDiagnosis(
  transactionId: string,
): Promise<TransactionDiagnosisView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: SAMPLE_DATA_PATH,
      repository: db.transactions,
    });

    const transaction = transactions.find((t) => t.id === transactionId);
    if (!transaction) return null;

    const failureReason = classifyFailure(transaction);
    const customerHistoryIndex = buildCustomerHistoryIndex(transactions);
    const customerHistory =
      customerHistoryIndex.get(transaction.customerId) ?? NEUTRAL_CUSTOMER_HISTORY;
    const risk = scoreTransaction(transaction, failureReason, customerHistory, {
      now: new Date(),
    });

    const diagnosisInput: DiagnosisInput = {
      transactionId: transaction.id,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      transactionStatus: transaction.status,
      attemptCount: transaction.attemptCount,
      failureCode: failureReason.code,
      failureDescription: failureReason.description,
      retryable: failureReason.recoverable,
      riskScore: risk.riskScore,
      recoverabilityScore: risk.recoverabilityScore,
      expectedRecoveryAmount: risk.expectedRecoveryAmount,
      customerHistory: {
        totalTransactions: customerHistory.totalTransactions,
        successfulTransactions: customerHistory.successfulTransactions,
        reliabilityScore: customerHistory.reliabilityScore,
      },
    };

    const provider = resolveProvider();
    const diagnosisAgent = new GroundedDiagnosisAgent({ provider });
    const outcome = await diagnosisAgent.diagnose(diagnosisInput, { logger: consoleLogger });

    const altMethod = hasSucceededWithAlternateMethod(transactions, transaction);
    const strategyInput: StrategyInput = {
      transactionId: transaction.id,
      diagnosis: outcome.diagnosis,
      amount: transaction.amount,
      riskScore: risk.riskScore,
      recoverabilityScore: risk.recoverabilityScore,
      expectedRecoveryAmount: risk.expectedRecoveryAmount,
      priority: risk.priority,
      attemptCount: transaction.attemptCount,
      retryable: failureReason.recoverable,
      hasSucceededWithAlternateMethod: altMethod,
    };
    const strategyAgent = new GroundedStrategyAgent({ provider });
    const strategyOutcome = await strategyAgent.selectStrategy(strategyInput, {
      logger: consoleLogger,
    });
    // Same deterministic policy the agent itself consulted — recomputed
    // here (not re-derived from the decision) purely to show the full
    // candidate set the UI, not just the one the agent picked.
    const policy = buildStrategyPolicyContext(strategyInput);

    return {
      transaction,
      failureReason,
      risk,
      amount: transaction.amount,
      outcome,
      strategyOutcome,
      allowedStrategies: policy.allowedStrategies,
      strategyConstraints: policy.constraints,
      hasSucceededWithAlternateMethod: altMethod,
    };
  } catch {
    return null;
  }
}
