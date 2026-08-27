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
  BatchRecoveryPipeline,
  DeterministicDetectionAgent,
  DeterministicPrioritizationAgent,
  DeterministicVerificationAgent,
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  RecoveryPipeline,
  SimulatedRecoveryAgent,
  type BatchPipelineResult,
  type PipelineTransactionFacts,
  type RecoveryPipelineAgents,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { createInMemoryDatabase } from "@recoverai/database";
import { AnthropicProvider, RecoveryExecutionSimulator, type AIModelProvider } from "@recoverai/integrations";
import type { Logger } from "@recoverai/core";

const SAMPLE_DATA_PATH = resolve(process.cwd(), "../../data/samples/transactions.json");

/** No-op-ish logger: server console only, mirrors lib/diagnosis.ts. */
const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[pipeline:${level}]`, message, context ?? {});
  },
};

function resolveProvider(): AIModelProvider | null {
  const config = loadConfig();
  return config.ai.isConfigured && config.ai.apiKey && config.ai.model
    ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
    : null;
}

function buildAgents(provider: AIModelProvider | null): RecoveryPipelineAgents {
  return {
    detection: new DeterministicDetectionAgent(),
    diagnosis: new GroundedDiagnosisAgent({ provider }),
    prioritization: new DeterministicPrioritizationAgent(),
    strategy: new GroundedStrategyAgent({ provider }),
    recovery: new SimulatedRecoveryAgent({ simulationProvider: new RecoveryExecutionSimulator() }),
    verification: new DeterministicVerificationAgent(),
  };
}

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

function buildFactsList(transactions: readonly NormalizedTransaction[]): readonly PipelineTransactionFacts[] {
  const customerHistoryIndex = buildCustomerHistoryIndex(transactions);

  return transactions.map((transaction) => {
    const isRiskEligible = transaction.status === "failed" || transaction.status === "abandoned";
    if (!isRiskEligible) {
      return {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        attemptCount: transaction.attemptCount,
      };
    }

    const failureReason = classifyFailure(transaction);
    const customerHistory = customerHistoryIndex.get(transaction.customerId) ?? NEUTRAL_CUSTOMER_HISTORY;
    const risk = scoreTransaction(transaction, failureReason, customerHistory, { now: new Date() });

    return {
      transactionId: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      attemptCount: transaction.attemptCount,
      failureCode: failureReason.code,
      failureDescription: failureReason.description,
      retryable: failureReason.recoverable,
      riskScore: risk.riskScore,
      recoverabilityScore: risk.recoverabilityScore,
      expectedRecoveryAmount: risk.expectedRecoveryAmount,
      priority: risk.priority,
      customerHistory: {
        totalTransactions: customerHistory.totalTransactions,
        successfulTransactions: customerHistory.successfulTransactions,
        reliabilityScore: customerHistory.reliabilityScore,
      },
      hasSucceededWithAlternateMethod: hasSucceededWithAlternateMethod(transactions, transaction),
    };
  });
}

export interface PortfolioPipelineView {
  readonly file: string;
  readonly batch: BatchPipelineResult;
}

/**
 * Server-only: runs the full six-stage `RecoveryPipeline` (SIMULATION only)
 * over the bundled sample dataset and returns the aggregated
 * `BatchPipelineResult` — the same real pipeline `recoverai pipeline run`
 * uses. Returns `null` only if ingestion itself fails; an empty dataset is
 * still a valid (if empty) result.
 */
export async function loadPortfolioPipeline(): Promise<PortfolioPipelineView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: SAMPLE_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;

    const provider = resolveProvider();
    const agents = buildAgents(provider);
    const pipeline = new RecoveryPipeline(agents, { logger: consoleLogger });
    const batchPipeline = new BatchRecoveryPipeline(pipeline);

    const factsList = buildFactsList(transactions);
    const batch = await batchPipeline.run(factsList);

    return { file: "data/samples/transactions.json", batch };
  } catch {
    return null;
  }
}
