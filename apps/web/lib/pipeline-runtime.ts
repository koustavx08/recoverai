import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCustomerHistoryIndex,
  classifyFailure,
  ingestFile,
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
import type { Database } from "@recoverai/database";
import type { FailureReasonCode, PaymentAttempt, Transaction } from "@recoverai/core";

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

function latestAttemptedAt(
  attempts: readonly PaymentAttempt[],
  fallback: Transaction["createdAt"],
): Transaction["createdAt"] {
  if (attempts.length === 0) return fallback;
  return attempts.reduce(
    (latest, a) => (a.attemptedAt > latest ? a.attemptedAt : latest),
    attempts[0]!.attemptedAt,
  );
}

function latestFailureReasonCode(
  attempts: readonly PaymentAttempt[],
): FailureReasonCode | undefined {
  const failed = attempts.filter((a) => a.status === "failed" && a.failureReasonCode);
  if (failed.length === 0) return undefined;
  return failed.reduce(
    (latest, a) => (a.attemptedAt > latest.attemptedAt ? a : latest),
    failed[0]!,
  ).failureReasonCode;
}

/**
 * Reconstructs the ingestion-time-only fields (`attemptCount`,
 * `lastAttemptAt`, `failureReasonCode`, `source`) that `NormalizedTransaction`
 * adds on top of the persisted `Transaction` shape, mirroring
 * `@recoverai/analysis`'s own normalizer logic — every downstream consumer
 * (`analyzeTransactions`, `buildFactsList`, the diagnosis pipeline) expects
 * a `NormalizedTransaction`, not the bare repository record.
 */
function toNormalizedTransaction(transaction: Transaction, source: string): NormalizedTransaction {
  return {
    ...transaction,
    attemptCount: transaction.attempts.length,
    lastAttemptAt: latestAttemptedAt(transaction.attempts, transaction.createdAt),
    failureReasonCode: latestFailureReasonCode(transaction.attempts),
    source,
  };
}

/** Human-readable description of `loadPersistedTransactions`'s data source, for UI captions. */
export const PERSISTED_SOURCE_LABEL =
  "the persisted transaction store (seeded from data/samples/transactions.json)";

/**
 * Seeds the bundled dataset at `filePath` into the durable store (an
 * idempotent upsert by transaction id — safe to call on every request),
 * then reads back every transaction ever persisted there — this seed plus
 * anything separately ingested via `recoverai ingest`, not just this one
 * file. This is what lets the dashboard show real, accumulated data instead
 * of re-deriving the same static file fresh on every request.
 */
export async function loadPersistedTransactions(
  db: Database,
  filePath: string,
): Promise<readonly NormalizedTransaction[]> {
  await ingestFile({ filePath, repository: db.transactions });
  const rows = await db.transactions.findAll();
  return rows.map((transaction) => toNormalizedTransaction(transaction, "database"));
}
