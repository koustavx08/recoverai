import { randomUUID } from "node:crypto";
import type { AuditEvent, FailureReasonCode, ISODateString, Logger, RiskPriority } from "@recoverai/core";
import { brand } from "@recoverai/core";
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
  type DiagnosisInput,
  type DiagnosisOutcome,
  type StrategyInput,
  type StrategyOutcome,
} from "@recoverai/agents";
import { AnthropicProvider, type AIModelProvider } from "@recoverai/integrations";
import { loadConfig } from "@recoverai/config";
import { createInMemoryDatabase } from "@recoverai/database";
import { errorResult, type CommandResult, type CommandName } from "./types.js";

/** Used when no --file is given — the canonical, always-available fixture dataset, shared by every stage-based command (`agent`, `recover`). */
export const DEFAULT_PIPELINE_FILE = "data/samples/transactions.json";

export function resolveAIProvider(): AIModelProvider | null {
  const config = loadConfig();
  return config.ai.isConfigured && config.ai.apiKey && config.ai.model
    ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
    : null;
}

export function buildDiagnosisAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: DiagnosisOutcome,
): AuditEvent {
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "agent_decision_recorded",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: `Diagnosis agent produced a "${outcome.diagnosis.category}" diagnosis (${outcome.meta.mode} mode).`,
    // Metadata is flat primitives only — never store raw credentials, and
    // never store anything beyond what's needed to audit this decision.
    data: {
      mode: outcome.meta.mode,
      provider: outcome.meta.provider,
      model: outcome.meta.model,
      latencyMs: outcome.meta.latencyMs,
      validationSuccess: outcome.meta.validationSuccess,
      fallbackUsed: outcome.meta.fallbackUsed,
      fallbackReason: outcome.meta.fallbackReason ?? null,
      inputTokenCount: outcome.meta.inputTokens ?? null,
      outputTokenCount: outcome.meta.outputTokens ?? null,
      category: outcome.diagnosis.category,
      confidence: outcome.diagnosis.confidence,
      recoverabilityAssessment: outcome.diagnosis.recoverabilityAssessment,
    },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

export function buildStrategyAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: StrategyOutcome,
): AuditEvent {
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "strategy_selected",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: `Strategy agent selected "${outcome.decision.strategy}" (${outcome.meta.mode} mode).`,
    data: {
      mode: outcome.meta.mode,
      provider: outcome.meta.provider,
      model: outcome.meta.model,
      latencyMs: outcome.meta.latencyMs,
      validationSuccess: outcome.meta.validationSuccess,
      fallbackUsed: outcome.meta.fallbackUsed,
      fallbackReason: outcome.meta.fallbackReason ?? null,
      inputTokenCount: outcome.meta.inputTokens ?? null,
      outputTokenCount: outcome.meta.outputTokens ?? null,
      selectedStrategy: outcome.decision.strategy,
      confidence: outcome.decision.confidence,
      requiresHumanApproval: outcome.decision.requiresHumanApproval,
    },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

export interface DiagnosisContext {
  readonly transaction: NormalizedTransaction;
  readonly transactions: readonly NormalizedTransaction[];
  readonly failureCode: FailureReasonCode;
  readonly retryable: boolean;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: NormalizedTransaction["amount"];
  readonly priority: RiskPriority;
  readonly diagnosisOutcome: DiagnosisOutcome;
}

export function isCommandResult<T>(value: T | CommandResult): value is CommandResult {
  return typeof value === "object" && value !== null && "status" in value;
}

/** Deterministic: has this customer ever succeeded with a different payment method than the one on the given transaction, within the same ingested batch? */
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

/**
 * Shared setup for every stage downstream of diagnosis: ingest -> classify
 * -> risk-score -> diagnose. `agent --stage diagnosis|strategy` and
 * `recover` all need this exact pipeline (Strategy Selection sits strictly
 * downstream of Diagnosis, and Recovery downstream of Strategy — see
 * docs/agent-architecture.md), so it's built once here rather than
 * duplicated per command.
 */
export async function buildDiagnosisContext(
  transactionId: string,
  filePath: string,
  provider: AIModelProvider | null,
  logger: Logger,
  command: CommandName,
): Promise<DiagnosisContext | CommandResult> {
  const db = createInMemoryDatabase();

  let transactions: readonly NormalizedTransaction[];
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult(command, error instanceof Error ? error.message : String(error));
  }

  const transaction = transactions.find((t) => t.id === transactionId);
  if (!transaction) {
    return errorResult(command, `Transaction "${transactionId}" was not found in "${filePath}".`);
  }

  const failureReason = classifyFailure(transaction);
  const customerHistoryIndex = buildCustomerHistoryIndex(transactions);
  const customerHistory = customerHistoryIndex.get(transaction.customerId) ?? NEUTRAL_CUSTOMER_HISTORY;
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

  const diagnosisAgent = new GroundedDiagnosisAgent({ provider });
  const diagnosisOutcome = await diagnosisAgent.diagnose(diagnosisInput, { logger });
  await db.auditEvents.append(
    buildDiagnosisAuditEvent(transaction, diagnosisAgent.id, diagnosisOutcome),
  );

  return {
    transaction,
    transactions,
    failureCode: failureReason.code,
    retryable: failureReason.recoverable,
    riskScore: risk.riskScore,
    recoverabilityScore: risk.recoverabilityScore,
    expectedRecoveryAmount: risk.expectedRecoveryAmount,
    priority: risk.priority,
    diagnosisOutcome,
  };
}

export interface StrategyContext extends DiagnosisContext {
  readonly strategyOutcome: StrategyOutcome;
  readonly hasAlternateMethodHistory: boolean;
}

/** Builds on `buildDiagnosisContext`, then runs Strategy Selection over its output. */
export async function buildStrategyContext(
  transactionId: string,
  filePath: string,
  provider: AIModelProvider | null,
  logger: Logger,
  command: CommandName,
): Promise<StrategyContext | CommandResult> {
  const context = await buildDiagnosisContext(transactionId, filePath, provider, logger, command);
  if (isCommandResult(context)) return context;

  const { transaction, transactions, retryable, riskScore, recoverabilityScore, expectedRecoveryAmount, priority, diagnosisOutcome } =
    context;

  const hasAlternateMethodHistory = hasSucceededWithAlternateMethod(transactions, transaction);
  const strategyInput: StrategyInput = {
    transactionId: transaction.id,
    diagnosis: diagnosisOutcome.diagnosis,
    amount: transaction.amount,
    riskScore,
    recoverabilityScore,
    expectedRecoveryAmount,
    priority,
    attemptCount: transaction.attemptCount,
    retryable,
    hasSucceededWithAlternateMethod: hasAlternateMethodHistory,
  };

  const db = createInMemoryDatabase();
  const strategyAgent = new GroundedStrategyAgent({ provider });
  const strategyOutcome = await strategyAgent.selectStrategy(strategyInput, { logger });
  await db.auditEvents.append(buildStrategyAuditEvent(transaction, strategyAgent.id, strategyOutcome));

  return { ...context, strategyOutcome, hasAlternateMethodHistory };
}
