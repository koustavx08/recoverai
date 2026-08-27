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
  type DiagnosisInput,
  type DiagnosisOutcome,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { createInMemoryDatabase } from "@recoverai/database";
import { AnthropicProvider } from "@recoverai/integrations";
import type { FailureReason, Logger, Money, RevenueRisk } from "@recoverai/core";

const SAMPLE_DATA_PATH = resolve(process.cwd(), "../../data/samples/transactions.json");

/** No-op logger: the web app has no CLI stderr to write diagnostic lines to yet — server console is enough for now. */
const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[diagnosis-agent:${level}]`, message, context ?? {});
  },
};

export interface TransactionDiagnosisView {
  readonly transaction: NormalizedTransaction;
  readonly failureReason: FailureReason;
  readonly risk: RevenueRisk;
  readonly amount: Money;
  readonly outcome: DiagnosisOutcome;
}

/**
 * Server-only: runs the same ingestion -> classification -> risk-scoring ->
 * diagnosis pipeline the CLI's `agent --stage diagnosis` command uses,
 * against the bundled sample dataset, for one transaction id. Returns
 * `null` when the transaction isn't in the dataset — the page renders a
 * 404 in that case, nothing is fabricated.
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

    const config = loadConfig();
    const provider =
      config.ai.isConfigured && config.ai.apiKey && config.ai.model
        ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
        : null;

    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(diagnosisInput, { logger: consoleLogger });

    return { transaction, failureReason, risk, amount: transaction.amount, outcome };
  } catch {
    return null;
  }
}
