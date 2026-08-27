import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditEvent, ISODateString, Logger, RecoveryAction, RecoveryActionStatus, RecoveryOutcome } from "@recoverai/core";
import { brand } from "@recoverai/core";
import {
  DeterministicVerificationAgent,
  SimulatedRecoveryAgent,
  type RecoveryExecutionOutcome,
  type RecoveryExecutionRequest,
  type RecoveryVerificationOutcome,
} from "@recoverai/agents";
import { RecoveryExecutionSimulator } from "@recoverai/integrations";
import { createInMemoryDatabase } from "@recoverai/database";
import type { NormalizedTransaction } from "@recoverai/analysis";
import {
  DEFAULT_PIPELINE_FILE,
  buildStrategyContext,
  isCommandResult,
  resolveAIProvider,
} from "./pipeline-context.js";
import { errorResult, type CommandResult } from "./types.js";

export const recoverOptionsSchema = z.object({
  transaction: z.string().min(1, "transaction is required, e.g. --transaction txn_00002"),
  file: z.string().optional(),
  json: z.boolean().optional().default(false),
  /** Explicit seed override for the deterministic simulator — same transaction + strategy + seed always reproduces the same outcome. */
  seed: z.string().optional(),
  /** Always rejected in this phase — see runRecover(). Exists only so the CLI can give a clear, deliberate error instead of an unknown-option one. */
  live: z.boolean().optional().default(false),
});
export type RecoverOptions = z.infer<typeof recoverOptionsSchema>;

/** RecoveryOutcome -> RecoveryActionStatus (both `@recoverai/core`, both bounded) — lets a simulated execution reuse the existing RecoveryActionRepository abstraction rather than a new persistence type, per Task 11's "do not introduce unnecessary persistence complexity." */
const OUTCOME_TO_ACTION_STATUS: Readonly<Record<RecoveryOutcome, RecoveryActionStatus>> = {
  success: "succeeded",
  failure: "failed",
  pending: "pending",
  blocked: "cancelled",
  not_executed: "skipped",
};

function toRecoveryAction(outcome: RecoveryExecutionOutcome): RecoveryAction {
  const { result } = outcome;
  return {
    id: brand<string, "RecoveryActionId">(result.executionId),
    transactionId: brand<string, "TransactionId">(result.transactionId),
    type: result.action,
    strategy: result.strategy,
    status: OUTCOME_TO_ACTION_STATUS[result.outcome],
    executedAt: brand<string, "ISODateString">(result.executedAt) as ISODateString,
    metadata: {
      simulationMode: result.simulationMode,
      outcome: result.outcome,
      recoveredAmount: result.recoveredAmount.amount,
      recoveredCurrency: result.recoveredAmount.currency,
    },
  };
}

function buildRecoveryExecutionAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: RecoveryExecutionOutcome,
): AuditEvent {
  const { result } = outcome;
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "recovery_action_executed",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: `SIMULATED recovery execution for strategy "${result.strategy}" resulted in "${result.outcome}".`,
    data: {
      simulationMode: result.simulationMode,
      strategy: result.strategy,
      action: result.action,
      outcome: result.outcome,
      recoveredAmount: result.recoveredAmount.amount,
      recoveredCurrency: result.recoveredAmount.currency,
      blockedReason: result.blockedReason ?? null,
      executionId: result.executionId,
      latencyMs: outcome.meta.latencyMs,
    },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

function buildRecoveryVerificationAuditEvent(
  transaction: NormalizedTransaction,
  agentId: string,
  outcome: RecoveryVerificationOutcome,
): AuditEvent {
  const { verification } = outcome;
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "recovery_verified",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: agentId,
    summary: `Verification agent marked execution "${verification.executionId}" as ${verification.verified ? "VERIFIED" : "INVALID"}.`,
    data: {
      verified: verification.verified,
      reasons: verification.reasons.join("; "),
      executionId: verification.executionId,
      latencyMs: outcome.meta.latencyMs,
    },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

/**
 * Runs the full recovery pipeline for one transaction, end to end: ingest
 * -> classify -> risk-score -> diagnose -> select strategy -> build a
 * policy-checked execution plan -> run the deterministic simulator ->
 * independently verify the result -> record the audit trail. Every
 * execution in this phase is a SIMULATION — see
 * RecoveryExecutionRequest.executionContext.simulationMode. There is no
 * live execution path; `--live` is rejected outright rather than silently
 * ignored.
 */
export async function runRecover(options: RecoverOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "recover service invoked", {
    transaction: options.transaction,
    seed: options.seed,
    live: options.live,
  });

  if (options.live) {
    return errorResult(
      "recover",
      "Live recovery execution is not implemented. Only simulated recovery (the default) is supported in this phase — omit --live.",
    );
  }

  const filePath = options.file ?? DEFAULT_PIPELINE_FILE;
  const provider = resolveAIProvider();
  const context = await buildStrategyContext(options.transaction, filePath, provider, logger, "recover");
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
    executionContext: { simulationMode: true, seed: options.seed },
  };

  const recoveryAgent = new SimulatedRecoveryAgent({
    simulationProvider: new RecoveryExecutionSimulator(),
  });
  const executionOutcome = await recoveryAgent.executeRecovery(request, { logger });

  const verificationAgent = new DeterministicVerificationAgent();
  const verificationOutcome = await verificationAgent.verifyRecovery(executionOutcome.result, { logger });

  const db = createInMemoryDatabase();
  // Reuses the existing RecoveryActionRepository (unused since Phase 1 —
  // RecoveryAgent was never implemented until now) to persist the
  // execution plan/result via the existing RecoveryAction domain type,
  // rather than introducing a new repository abstraction for it.
  await db.recoveryActions.save(toRecoveryAction(executionOutcome));
  await db.auditEvents.append(
    buildRecoveryExecutionAuditEvent(transaction, recoveryAgent.id, executionOutcome),
  );
  await db.auditEvents.append(
    buildRecoveryVerificationAuditEvent(transaction, verificationAgent.id, verificationOutcome),
  );

  logger.log("info", "recovery execution completed", {
    transactionId: transaction.id,
    strategy: executionOutcome.result.strategy,
    outcome: executionOutcome.result.outcome,
    simulationMode: executionOutcome.result.simulationMode,
    verified: verificationOutcome.verification.verified,
  });

  return {
    status: "recovered",
    command: "recover",
    transactionId: transaction.id,
    diagnosis: diagnosisOutcome.diagnosis,
    decision: strategyOutcome.decision,
    execution: executionOutcome.result,
    executionMeta: executionOutcome.meta,
    verification: verificationOutcome.verification,
    json: options.json,
  };
}
