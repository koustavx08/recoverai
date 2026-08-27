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
  type PipelineResult,
  type PipelineTransactionFacts,
  type RecoveryPipelineAgents,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { createInMemoryDatabase } from "@recoverai/database";
import { AnthropicProvider, RecoveryExecutionSimulator, type AIModelProvider } from "@recoverai/integrations";
import type { Logger } from "@recoverai/core";

const DEMO_DATA_PATH = resolve(process.cwd(), "../../data/demo/scenarios.json");

/** Transactions carrying this scenario tag exist only to give another
 * transaction realistic customer history — never shown as a demo case. */
const SUPPORTING_SCENARIO_TAG = "demo_history_support";

const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[demo:${level}]`, message, context ?? {});
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

export interface DemoScenarioView {
  readonly id: string;
  readonly title: string;
  readonly narrative: string;
  readonly amount: NormalizedTransaction["amount"];
  readonly result: PipelineResult;
}

export interface DemoPipelineView {
  readonly file: string;
  readonly scenarios: readonly DemoScenarioView[];
}

/**
 * Server-only: runs the full six-stage `RecoveryPipeline` (SIMULATION only)
 * over the curated demo dataset (`data/demo/scenarios.json`) and pairs each
 * named scenario's real `PipelineResult` with its narrative copy. The
 * pipeline itself is identical to the one `loadPortfolioPipeline()` and
 * `recoverai pipeline run` use — nothing here is a fabricated or
 * hand-written outcome.
 */
export async function loadDemoScenarios(): Promise<DemoPipelineView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: DEMO_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;

    const provider = resolveProvider();
    const agents = buildAgents(provider);
    const pipeline = new RecoveryPipeline(agents, { logger: consoleLogger });
    const batchPipeline = new BatchRecoveryPipeline(pipeline);

    const factsList = buildFactsList(transactions);
    const batch = await batchPipeline.run(factsList);

    const resultsById = new Map(batch.results.map((result) => [result.transactionId, result]));
    const scenarios: DemoScenarioView[] = [];

    for (const transaction of transactions) {
      const scenarioTag = transaction.metadata?.scenario;
      if (typeof scenarioTag !== "string" || scenarioTag === SUPPORTING_SCENARIO_TAG) continue;

      const result = resultsById.get(transaction.id);
      if (!result) continue;

      scenarios.push({
        id: transaction.id,
        title: typeof transaction.metadata?.title === "string" ? transaction.metadata.title : transaction.id,
        narrative: typeof transaction.metadata?.narrative === "string" ? transaction.metadata.narrative : "",
        amount: transaction.amount,
        result,
      });
    }

    return { file: "data/demo/scenarios.json", scenarios };
  } catch {
    return null;
  }
}
