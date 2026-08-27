import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditEvent, FailureReasonCode, ISODateString, Logger } from "@recoverai/core";
import { brand } from "@recoverai/core";
import {
  buildCustomerHistoryIndex,
  classifyFailure,
  ingestFile,
  NEUTRAL_CUSTOMER_HISTORY,
  scoreTransaction,
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
import type { NormalizedTransaction } from "@recoverai/analysis";
import { errorResult, notImplemented, type CommandResult } from "./types.js";

/** Used when no --file is given — the canonical, always-available fixture dataset, matching `analyze`'s default. */
export const DEFAULT_AGENT_FILE = "data/samples/transactions.json";

export const agentOptionsSchema = z.object({
  stage: z
    .enum([
      "detection",
      "diagnosis",
      "prioritization",
      "strategy",
      "strategy_selection",
      "recovery_execution",
      "verification",
    ])
    .optional(),
  transaction: z.string().optional(),
  file: z.string().optional(),
  json: z.boolean().optional().default(false),
});
export type AgentOptions = z.infer<typeof agentOptionsSchema>;

function resolveProvider(): AIModelProvider | null {
  const config = loadConfig();
  return config.ai.isConfigured && config.ai.apiKey && config.ai.model
    ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
    : null;
}

function buildDiagnosisAuditEvent(
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

function buildStrategyAuditEvent(
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

interface DiagnosisContext {
  readonly transaction: NormalizedTransaction;
  readonly transactions: readonly NormalizedTransaction[];
  readonly failureCode: FailureReasonCode;
  readonly retryable: boolean;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: NormalizedTransaction["amount"];
  readonly priority: "critical" | "high" | "medium" | "low";
  readonly diagnosisOutcome: DiagnosisOutcome;
}

/**
 * Shared setup for every stage downstream of diagnosis: ingest -> classify
 * -> risk-score -> diagnose. Both the "diagnosis" and "strategy" stages
 * need this exact pipeline (Strategy Selection sits strictly downstream of
 * Diagnosis in the architecture — see docs/agent-architecture.md), so it's
 * built once here rather than duplicated per stage.
 */
async function buildDiagnosisContext(
  transactionId: string,
  filePath: string,
  provider: AIModelProvider | null,
  logger: Logger,
): Promise<DiagnosisContext | CommandResult> {
  const db = createInMemoryDatabase();

  let transactions: readonly NormalizedTransaction[];
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult("agent", error instanceof Error ? error.message : String(error));
  }

  const transaction = transactions.find((t) => t.id === transactionId);
  if (!transaction) {
    return errorResult(
      "agent",
      `Transaction "${transactionId}" was not found in "${filePath}".`,
    );
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

function isCommandResult(value: DiagnosisContext | CommandResult): value is CommandResult {
  return "status" in value;
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

async function runDiagnosisStage(
  options: AgentOptions,
  logger: Logger,
): Promise<CommandResult> {
  if (!options.transaction) {
    return errorResult(
      "agent",
      "--transaction <id> is required for --stage diagnosis, e.g. --transaction txn_00002.",
    );
  }

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveProvider();
  const context = await buildDiagnosisContext(options.transaction, filePath, provider, logger);
  if (isCommandResult(context)) return context;

  const { transaction, failureCode, diagnosisOutcome } = context;
  logger.log("info", "diagnosis agent completed", {
    transactionId: transaction.id,
    mode: diagnosisOutcome.meta.mode,
    fallbackUsed: diagnosisOutcome.meta.fallbackUsed,
    validationSuccess: diagnosisOutcome.meta.validationSuccess,
    latencyMs: diagnosisOutcome.meta.latencyMs,
  });

  return {
    status: "diagnosed",
    command: "agent",
    transactionId: transaction.id,
    amount: transaction.amount,
    failureCode,
    diagnosis: diagnosisOutcome.diagnosis,
    meta: diagnosisOutcome.meta,
    json: options.json,
  };
}

async function runStrategyStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  if (!options.transaction) {
    return errorResult(
      "agent",
      "--transaction <id> is required for --stage strategy, e.g. --transaction txn_00002.",
    );
  }

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveProvider();
  const context = await buildDiagnosisContext(options.transaction, filePath, provider, logger);
  if (isCommandResult(context)) return context;

  const {
    transaction,
    transactions,
    retryable,
    riskScore,
    recoverabilityScore,
    expectedRecoveryAmount,
    priority,
    diagnosisOutcome,
  } = context;

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
    hasSucceededWithAlternateMethod: hasSucceededWithAlternateMethod(transactions, transaction),
  };

  const db = createInMemoryDatabase();
  const strategyAgent = new GroundedStrategyAgent({ provider });
  const strategyOutcome = await strategyAgent.selectStrategy(strategyInput, { logger });
  await db.auditEvents.append(
    buildStrategyAuditEvent(transaction, strategyAgent.id, strategyOutcome),
  );

  logger.log("info", "strategy agent completed", {
    transactionId: transaction.id,
    mode: strategyOutcome.meta.mode,
    strategy: strategyOutcome.decision.strategy,
    fallbackUsed: strategyOutcome.meta.fallbackUsed,
    validationSuccess: strategyOutcome.meta.validationSuccess,
    latencyMs: strategyOutcome.meta.latencyMs,
  });

  return {
    status: "strategized",
    command: "agent",
    transactionId: transaction.id,
    diagnosis: diagnosisOutcome.diagnosis,
    riskScore,
    recoverabilityScore,
    decision: strategyOutcome.decision,
    meta: strategyOutcome.meta,
    json: options.json,
  };
}

/**
 * Runs the "diagnosis" or "strategy" agent stage against a single
 * transaction in a dataset. Every other stage remains not-implemented (the
 * Recovery/Verification agents are out of scope for this phase — see
 * docs/agent-architecture.md).
 */
export async function runAgent(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "agent service invoked", { stage: options.stage ?? "all" });

  if (options.stage === "diagnosis") return runDiagnosisStage(options, logger);
  if (options.stage === "strategy" || options.stage === "strategy_selection") {
    return runStrategyStage(options, logger);
  }

  return notImplemented(
    "agent",
    options.stage
      ? `The "${options.stage}" agent stage is not implemented yet.`
      : 'Only the "diagnosis" and "strategy" stages are implemented so far. Pass --stage diagnosis|strategy --transaction <id>.',
  );
}
