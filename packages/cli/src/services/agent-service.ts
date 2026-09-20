import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditEvent, ISODateString, Logger } from "@recoverai/core";
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
  SimulatedRecoveryAgent,
  type DetectionInput,
  type DetectionOutcome,
  type PrioritizationInput,
  type PrioritizationOutcome,
  type RecoveryExecutionRequest,
} from "@recoverai/agents";
import { RecoveryExecutionSimulator } from "@recoverai/integrations";
import { createPrismaDatabase } from "@recoverai/database";
import {
  DEFAULT_PIPELINE_FILE,
  buildDiagnosisContext,
  buildStrategyContext,
  isCommandResult,
  resolveAIProvider,
} from "./pipeline-context.js";
import { buildRecoveryExecutionAuditEvent, buildRecoveryVerificationAuditEvent } from "./recover-service.js";
import { errorResult, notImplemented, type CommandResult } from "./types.js";

/** Used when no --file is given — the canonical, always-available fixture dataset, matching `analyze`'s default. */
export const DEFAULT_AGENT_FILE = DEFAULT_PIPELINE_FILE;

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

function requireTransaction(stage: string, options: AgentOptions): string | null {
  if (options.transaction) return null;
  return `--transaction <id> is required for --stage ${stage}, e.g. --transaction txn_00002.`;
}

/** Ingest + classify + risk-score one transaction — the shared prerequisite for detection and prioritization, which sit upstream of diagnosis and don't need it. */
async function buildRiskContext(transactionId: string, filePath: string) {
  const db = createPrismaDatabase();
  const { transactions } = await ingestFile({ filePath, repository: db.transactions });

  const transaction = transactions.find((t) => t.id === transactionId);
  if (!transaction) {
    throw new Error(`Transaction "${transactionId}" was not found in "${filePath}".`);
  }

  const isRiskEligible = transaction.status === "failed" || transaction.status === "abandoned";
  const failureReason = isRiskEligible ? classifyFailure(transaction) : undefined;
  const customerHistoryIndex = buildCustomerHistoryIndex(transactions);
  const customerHistory = customerHistoryIndex.get(transaction.customerId) ?? NEUTRAL_CUSTOMER_HISTORY;
  const risk =
    failureReason !== undefined
      ? scoreTransaction(transaction, failureReason, customerHistory, { now: new Date() })
      : undefined;

  return { db, transaction, transactions, failureReason, customerHistory, risk };
}

function buildDetectionAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: DetectionOutcome,
): AuditEvent {
  const { result } = outcome;
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "agent_decision_recorded",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: result.detected
      ? `Detection found this transaction ${result.actionable ? "actionable" : "not actionable"} (severity: ${result.severity}).`
      : "Detection found nothing to act on.",
    data: { detected: result.detected, actionable: result.actionable, severity: result.severity, reason: result.reason },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

function buildPrioritizationAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: PrioritizationOutcome,
): AuditEvent {
  const { result } = outcome;
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "risk_assessed",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: `Prioritized as "${result.priority}" (score ${result.score}/100).`,
    data: { priority: result.priority, score: result.score, factors: result.factors.join("; ") },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

async function runDetectionStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  const missing = requireTransaction("detection", options);
  if (missing) return errorResult("agent", missing);

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  let context: Awaited<ReturnType<typeof buildRiskContext>>;
  try {
    context = await buildRiskContext(options.transaction as string, filePath);
  } catch (error) {
    return errorResult("agent", error instanceof Error ? error.message : String(error));
  }
  const { db, transaction, failureReason } = context;

  const input: DetectionInput = {
    transactionId: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    attemptCount: transaction.attemptCount,
    failureCode: failureReason?.code,
    retryable: failureReason?.recoverable,
  };

  const agent = new DeterministicDetectionAgent();
  const outcome = await agent.detect(input, { logger });
  await db.auditEvents.append(buildDetectionAuditEvent(transaction, agent.id, outcome));

  logger.log("info", "detection agent completed", {
    transactionId: transaction.id,
    detected: outcome.result.detected,
    actionable: outcome.result.actionable,
  });

  return {
    status: "detected",
    command: "agent",
    transactionId: transaction.id,
    result: outcome.result,
    latencyMs: outcome.meta.latencyMs,
    json: options.json,
  };
}

async function runPrioritizationStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  const missing = requireTransaction("prioritization", options);
  if (missing) return errorResult("agent", missing);

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  let context: Awaited<ReturnType<typeof buildRiskContext>>;
  try {
    context = await buildRiskContext(options.transaction as string, filePath);
  } catch (error) {
    return errorResult("agent", error instanceof Error ? error.message : String(error));
  }
  const { db, transaction, failureReason, risk, customerHistory } = context;

  if (!risk || !failureReason) {
    return notImplemented(
      "agent",
      `Transaction "${transaction.id}" is "${transaction.status}", not failed/abandoned — Prioritization only runs for risk-eligible transactions.`,
    );
  }

  const input: PrioritizationInput = {
    transactionId: transaction.id,
    amount: transaction.amount,
    riskScore: risk.riskScore,
    recoverabilityScore: risk.recoverabilityScore,
    expectedRecoveryAmount: risk.expectedRecoveryAmount,
    priority: risk.priority,
    retryable: failureReason.recoverable,
    attemptCount: transaction.attemptCount,
    customerHistory: {
      totalTransactions: customerHistory.totalTransactions,
      successfulTransactions: customerHistory.successfulTransactions,
      reliabilityScore: customerHistory.reliabilityScore,
    },
  };

  const agent = new DeterministicPrioritizationAgent();
  const outcome = await agent.prioritize(input, { logger });
  await db.auditEvents.append(buildPrioritizationAuditEvent(transaction, agent.id, outcome));

  logger.log("info", "prioritization agent completed", {
    transactionId: transaction.id,
    priority: outcome.result.priority,
    score: outcome.result.score,
  });

  return {
    status: "prioritized",
    command: "agent",
    transactionId: transaction.id,
    result: outcome.result,
    latencyMs: outcome.meta.latencyMs,
    json: options.json,
  };
}

async function runDiagnosisStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  const missing = requireTransaction("diagnosis", options);
  if (missing) return errorResult("agent", missing);

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveAIProvider();
  const context = await buildDiagnosisContext(options.transaction as string, filePath, provider, logger, "agent");
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
  const missing = requireTransaction("strategy", options);
  if (missing) return errorResult("agent", missing);

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveAIProvider();
  const context = await buildStrategyContext(options.transaction as string, filePath, provider, logger, "agent");
  if (isCommandResult(context)) return context;

  const { transaction, riskScore, recoverabilityScore, diagnosisOutcome, strategyOutcome } = context;

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

/** Shared by both `--stage recovery_execution` and `--stage verification` — both sit strictly downstream of Strategy Selection (see docs/agent-architecture.md), so both need the full diagnosis -> strategy -> execution chain built first. */
async function runRecoveryExecution(options: AgentOptions, logger: Logger, stage: "recovery_execution" | "verification") {
  const missing = requireTransaction(stage, options);
  if (missing) return errorResult("agent", missing);

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveAIProvider();
  const context = await buildStrategyContext(options.transaction as string, filePath, provider, logger, "agent");
  if (isCommandResult(context)) return context;

  const { transaction, diagnosisOutcome, strategyOutcome, expectedRecoveryAmount, hasAlternateMethodHistory } =
    context;

  const request: RecoveryExecutionRequest = {
    transactionId: transaction.id,
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    attemptCount: transaction.attemptCount,
    diagnosis: diagnosisOutcome.diagnosis,
    strategyDecision: strategyOutcome.decision,
    expectedRecoveryAmount,
    hasSucceededWithAlternateMethod: hasAlternateMethodHistory,
    executionContext: { simulationMode: true },
  };

  const recoveryAgent = new SimulatedRecoveryAgent({
    simulationProvider: new RecoveryExecutionSimulator(),
  });
  const executionOutcome = await recoveryAgent.executeRecovery(request, { logger });

  const db = createPrismaDatabase();
  await db.auditEvents.append(
    buildRecoveryExecutionAuditEvent(transaction, recoveryAgent.id, executionOutcome),
  );

  return { transaction, diagnosisOutcome, strategyOutcome, executionOutcome, recoveryAgent, db };
}

async function runRecoveryExecutionStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  const outcome = await runRecoveryExecution(options, logger, "recovery_execution");
  if (isCommandResult(outcome)) return outcome;

  const { transaction, diagnosisOutcome, strategyOutcome, executionOutcome } = outcome;
  logger.log("info", "recovery execution agent completed", {
    transactionId: transaction.id,
    strategy: executionOutcome.result.strategy,
    outcome: executionOutcome.result.outcome,
    simulationMode: executionOutcome.result.simulationMode,
  });

  return {
    status: "recovery_executed",
    command: "agent",
    transactionId: transaction.id,
    diagnosis: diagnosisOutcome.diagnosis,
    decision: strategyOutcome.decision,
    execution: executionOutcome.result,
    executionMeta: executionOutcome.meta,
    json: options.json,
  };
}

async function runVerificationStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  const outcome = await runRecoveryExecution(options, logger, "verification");
  if (isCommandResult(outcome)) return outcome;

  const { transaction, executionOutcome, db } = outcome;

  const verificationAgent = new DeterministicVerificationAgent();
  const verificationOutcome = await verificationAgent.verifyRecovery(executionOutcome.result, { logger });
  await db.auditEvents.append(
    buildRecoveryVerificationAuditEvent(transaction, verificationAgent.id, verificationOutcome),
  );

  logger.log("info", "verification agent completed", {
    transactionId: transaction.id,
    verified: verificationOutcome.verification.verified,
  });

  return {
    status: "agent_verified",
    command: "agent",
    transactionId: transaction.id,
    execution: executionOutcome.result,
    verification: verificationOutcome.verification,
    json: options.json,
  };
}

/**
 * Runs any of the six pipeline stages independently against one
 * transaction in a dataset. Detection and Prioritization are cheap and
 * deterministic (no model); Diagnosis and Strategy are LLM-assisted with a
 * deterministic fallback; Recovery Execution and Verification build the
 * full diagnosis -> strategy chain first (both stages sit strictly
 * downstream of it — see docs/agent-architecture.md) and always run in
 * SIMULATION mode, identically to `recoverai recover`, just surfacing one
 * stage's output at a time instead of the combined result.
 */
export async function runAgent(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "agent service invoked", { stage: options.stage ?? "all" });

  if (options.stage === "detection") return runDetectionStage(options, logger);
  if (options.stage === "prioritization") return runPrioritizationStage(options, logger);
  if (options.stage === "diagnosis") return runDiagnosisStage(options, logger);
  if (options.stage === "strategy" || options.stage === "strategy_selection") {
    return runStrategyStage(options, logger);
  }
  if (options.stage === "recovery_execution") return runRecoveryExecutionStage(options, logger);
  if (options.stage === "verification") return runVerificationStage(options, logger);

  return notImplemented(
    "agent",
    "Pass --stage detection|diagnosis|prioritization|strategy|recovery_execution|verification --transaction <id>.",
  );
}
