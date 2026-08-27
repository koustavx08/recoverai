import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCustomerHistoryIndex,
  classifyFailure,
  NEUTRAL_CUSTOMER_HISTORY,
  scoreTransaction,
  type NormalizedTransaction,
} from "@recoverai/analysis";
import {
  DeterministicDetectionAgent,
  DeterministicPrioritizationAgent,
  DeterministicVerificationAgent,
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  SimulatedRecoveryAgent,
  type PipelineTransactionFacts,
  type RecoveryPipelineAgents,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { AnthropicProvider, RecoveryExecutionSimulator, type AIModelProvider } from "@recoverai/integrations";

/**
 * Resolves a path under the repo's `data/` directory relative to this
 * module's own file location — not `process.cwd()`, which is `apps/web`
 * under `next dev`/`next build` but the repo root under a root-level
 * `vitest run`. `apps/web/lib/` is always three directories below the repo
 * root, so this stays correct under either invocation.
 */
export function repoDataPath(...segments: readonly string[]): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "../../../data", ...segments);
}

/** Shared by every `lib/*.ts` view that runs the real pipeline server-side (`pipeline.ts`, `demo.ts`, `audit.ts`) — one place to build the six agents and the facts they need, so each view only differs in which transactions it feeds in. */
export function resolveProvider(): AIModelProvider | null {
  const config = loadConfig();
  return config.ai.isConfigured && config.ai.apiKey && config.ai.model
    ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
    : null;
}

export function buildPipelineAgents(provider: AIModelProvider | null): RecoveryPipelineAgents {
  return {
    detection: new DeterministicDetectionAgent(),
    diagnosis: new GroundedDiagnosisAgent({ provider }),
    prioritization: new DeterministicPrioritizationAgent(),
    strategy: new GroundedStrategyAgent({ provider }),
    recovery: new SimulatedRecoveryAgent({ simulationProvider: new RecoveryExecutionSimulator() }),
    verification: new DeterministicVerificationAgent(),
  };
}

export function hasSucceededWithAlternateMethod(
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

export function buildFactsList(
  transactions: readonly NormalizedTransaction[],
): readonly PipelineTransactionFacts[] {
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
