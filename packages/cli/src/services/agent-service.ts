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
} from "@recoverai/analysis";
import { GroundedDiagnosisAgent, type DiagnosisInput, type DiagnosisOutcome } from "@recoverai/agents";
import { AnthropicProvider } from "@recoverai/integrations";
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

/**
 * Runs the "diagnosis" agent stage against a single transaction in a
 * dataset: ingest -> classify -> risk-score -> diagnose -> audit. Every
 * other stage remains not-implemented (the Strategy/Recovery agents are out
 * of scope for this phase — see docs/agent-architecture.md).
 */
export async function runAgent(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "agent service invoked", { stage: options.stage ?? "all" });

  if (options.stage !== "diagnosis") {
    return notImplemented(
      "agent",
      options.stage
        ? `The "${options.stage}" agent stage is not implemented yet.`
        : 'Only the "diagnosis" stage is implemented so far. Pass --stage diagnosis --transaction <id>.',
    );
  }

  if (!options.transaction) {
    return errorResult(
      "agent",
      "--transaction <id> is required for --stage diagnosis, e.g. --transaction txn_00002.",
    );
  }

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const db = createInMemoryDatabase();

  let transactions: readonly NormalizedTransaction[];
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult("agent", error instanceof Error ? error.message : String(error));
  }

  const transaction = transactions.find((t) => t.id === options.transaction);
  if (!transaction) {
    return errorResult(
      "agent",
      `Transaction "${options.transaction}" was not found in "${filePath}".`,
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

  const config = loadConfig();
  const provider =
    config.ai.isConfigured && config.ai.apiKey && config.ai.model
      ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
      : null;

  const agent = new GroundedDiagnosisAgent({ provider });
  const outcome = await agent.diagnose(diagnosisInput, { logger });

  await db.auditEvents.append(buildDiagnosisAuditEvent(transaction, agent.id, outcome));

  logger.log("info", "diagnosis agent completed", {
    transactionId: transaction.id,
    mode: outcome.meta.mode,
    fallbackUsed: outcome.meta.fallbackUsed,
    validationSuccess: outcome.meta.validationSuccess,
    latencyMs: outcome.meta.latencyMs,
  });

  return {
    status: "diagnosed",
    command: "agent",
    transactionId: transaction.id,
    amount: transaction.amount,
    failureCode: failureReason.code,
    diagnosis: outcome.diagnosis,
    meta: outcome.meta,
    json: options.json,
  };
}
