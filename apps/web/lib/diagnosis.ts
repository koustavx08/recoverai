import {
  buildCustomerHistoryIndex,
  classifyFailure,
  NEUTRAL_CUSTOMER_HISTORY,
  scoreTransaction,
  type NormalizedTransaction,
} from "@recoverai/analysis";
import {
  DeterministicVerificationAgent,
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  SimulatedRecoveryAgent,
  buildStrategyPolicyContext,
  computeSimulationProfile,
  type DiagnosisInput,
  type DiagnosisOutcome,
  type RecoveryExecutionOutcome,
  type RecoveryExecutionRequest,
  type RecoveryVerificationOutcome,
  type SimulationProfile,
  type StrategyInput,
  type StrategyOutcome,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { createPrismaDatabase } from "@recoverai/database";
import {
  AnthropicProvider,
  RecoveryExecutionSimulator,
  type AIModelProvider,
} from "@recoverai/integrations";
import type {
  FailureReason,
  Logger,
  Money,
  RecoveryStrategyType,
  RevenueRisk,
} from "@recoverai/core";
import { loadPersistedTransactions, repoDataPath } from "./pipeline-runtime";

const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

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
  readonly executionOutcome: RecoveryExecutionOutcome;
  readonly verificationOutcome: RecoveryVerificationOutcome;
  readonly simulationProfile: SimulationProfile;
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
 * diagnosis|strategy` commands use, against every transaction persisted to
 * the durable store (the bundled sample dataset, seeded on every call,
 * plus anything separately ingested via `recoverai ingest`), for one
 * transaction id. Returns `null` when the transaction isn't found — the
 * page renders a 404 in that case, nothing is fabricated.
 */
export async function loadTransactionDiagnosis(
  transactionId: string,
): Promise<TransactionDiagnosisView | null> {
  try {
    const db = createPrismaDatabase();
    const transactions = await loadPersistedTransactions(db, SAMPLE_DATA_PATH);

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

    const executionRequest: RecoveryExecutionRequest = {
      transactionId: transaction.id,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      attemptCount: transaction.attemptCount,
      diagnosis: outcome.diagnosis,
      strategyDecision: strategyOutcome.decision,
      expectedRecoveryAmount: risk.expectedRecoveryAmount,
      hasSucceededWithAlternateMethod: altMethod,
      executionContext: { simulationMode: true },
    };
    // Computed independently of whether the simulator actually ran (e.g. a
    // blocked/pending outcome never reaches it) purely so the UI can always
    // show the simulation estimate and its factors, for transparency.
    const simulationProfile = computeSimulationProfile(executionRequest);

    const recoveryAgent = new SimulatedRecoveryAgent({
      simulationProvider: new RecoveryExecutionSimulator(),
    });
    const executionOutcome = await recoveryAgent.executeRecovery(executionRequest, {
      logger: consoleLogger,
    });

    const verificationAgent = new DeterministicVerificationAgent();
    const verificationOutcome = await verificationAgent.verifyRecovery(executionOutcome.result, {
      logger: consoleLogger,
    });

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
      executionOutcome,
      verificationOutcome,
      simulationProfile,
    };
  } catch {
    return null;
  }
}
