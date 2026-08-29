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
  DeterministicDetectionAgent,
  DeterministicPrioritizationAgent,
  DeterministicVerificationAgent,
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  SimulatedRecoveryAgent,
  type DiagnosisInput,
  type DiagnosisOutcome,
  type PipelineTransactionFacts,
  type RecoveryPipelineAgents,
  type StrategyInput,
  type StrategyOutcome,
} from "@recoverai/agents";
import { AnthropicProvider, RecoveryExecutionSimulator, type AIModelProvider } from "@recoverai/integrations";
import { loadConfig } from "@recoverai/config";
import { createPrismaDatabase } from "@recoverai/database";
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
  const db = createPrismaDatabase();

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

  const db = createPrismaDatabase();
  const strategyAgent = new GroundedStrategyAgent({ provider });
  const strategyOutcome = await strategyAgent.selectStrategy(strategyInput, { logger });
  await db.auditEvents.append(buildStrategyAuditEvent(transaction, strategyAgent.id, strategyOutcome));

  return { ...context, strategyOutcome, hasAlternateMethodHistory };
}

/**
 * Constructs one instance of each of the six pipeline agents — the
 * deterministic ones (Detection, Prioritization, Recovery, Verification)
 * need no configuration; the two AI-capable ones (Diagnosis, Strategy)
 * share the same resolved `AIModelProvider` (or `null`, running their
 * deterministic fallback) that every other command uses.
 */
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

/**
 * Builds one transaction's `PipelineTransactionFacts` — the flat DTO
 * `RecoveryPipeline.run()` needs — from real ingested/classified/
 * risk-scored data. For a transaction outside the risk-eligible statuses
 * (succeeded/pending), classification and risk-scoring never ran (mirrors
 * `@recoverai/analysis`'s own `analyzeTransactions()` — see
 * `RISK_ELIGIBLE_STATUSES` there), so the failure/risk fields are simply
 * left undefined; Detection alone is enough to correctly skip it.
 */
export function buildPipelineTransactionFacts(
  transaction: NormalizedTransaction,
  transactions: readonly NormalizedTransaction[],
  seed?: string,
): PipelineTransactionFacts {
  const isRiskEligible = transaction.status === "failed" || transaction.status === "abandoned";
  if (!isRiskEligible) {
    return {
      transactionId: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      attemptCount: transaction.attemptCount,
      seed,
    };
  }

  const failureReason = classifyFailure(transaction);
  const customerHistoryIndex = buildCustomerHistoryIndex(transactions);
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
    seed,
  };
}
