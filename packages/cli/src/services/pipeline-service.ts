import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditEvent, ISODateString, Logger } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { ingestFile, type NormalizedTransaction } from "@recoverai/analysis";
import { BatchRecoveryPipeline, RecoveryPipeline, type PipelineResult } from "@recoverai/agents";
import { createInMemoryDatabase } from "@recoverai/database";
import {
  DEFAULT_PIPELINE_FILE,
  buildPipelineAgents,
  buildPipelineTransactionFacts,
  resolveAIProvider,
} from "./pipeline-context.js";
import { errorResult, type CommandResult } from "./types.js";

export const pipelineRunOptionsSchema = z.object({
  transaction: z.string().optional(),
  file: z.string().optional(),
  json: z.boolean().optional().default(false),
  seed: z.string().optional(),
});
export type PipelineRunOptions = z.infer<typeof pipelineRunOptionsSchema>;

function buildPipelineAuditEvent(transaction: NormalizedTransaction, result: PipelineResult): AuditEvent {
  return {
    id: brand<string, "AuditEventId">(randomUUID()),
    type: "agent_decision_recorded",
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    actorType: "agent",
    actorId: "recovery-pipeline",
    summary: `Pipeline run for "${transaction.id}" finished with status "${result.status}".`,
    // Flat primitives only — reconstructs why the transaction entered the
    // pipeline, how it was prioritized/diagnosed, what strategy was
    // selected, whether execution occurred, and whether verification
    // passed, without ever storing a credential.
    data: {
      pipelineStatus: result.status,
      statusReason: result.statusReason ?? null,
      detected: result.detection?.result.detected ?? null,
      actionable: result.detection?.result.actionable ?? null,
      severity: result.detection?.result.severity ?? null,
      priority: result.prioritization?.result.priority ?? null,
      diagnosisCategory: result.diagnosis?.diagnosis.category ?? null,
      diagnosisMode: result.diagnosis?.meta.mode ?? null,
      selectedStrategy: result.strategy?.decision.strategy ?? null,
      strategyMode: result.strategy?.meta.mode ?? null,
      executionOutcome: result.execution?.result.outcome ?? null,
      simulationMode: result.execution?.result.simulationMode ?? null,
      recoveredAmount: result.execution?.result.recoveredAmount.amount ?? null,
      verified: result.verification?.verification.verified ?? null,
      totalLatencyMs: result.metadata.totalLatencyMs,
    },
    occurredAt: brand<string, "ISODateString">(new Date().toISOString()) as ISODateString,
  };
}

/**
 * Runs the full six-stage `RecoveryPipeline` — detect -> prioritize ->
 * diagnose -> select strategy -> simulate recovery -> verify -> audit —
 * for either one transaction (`--transaction`) or every transaction in a
 * file (batch mode, the default when no `--transaction` is given). Every
 * execution stays simulation-only; see `@recoverai/agents`' `RecoveryAgent`.
 */
export async function runPipeline(options: PipelineRunOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "pipeline service invoked", {
    transaction: options.transaction,
    file: options.file,
    seed: options.seed,
  });

  const filePath = options.file ?? DEFAULT_PIPELINE_FILE;
  const provider = resolveAIProvider();
  const db = createInMemoryDatabase();

  let transactions: readonly NormalizedTransaction[];
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult("pipeline", error instanceof Error ? error.message : String(error));
  }

  if (transactions.length === 0) {
    return errorResult("pipeline", `No valid transactions were found in "${filePath}" — nothing to run.`);
  }

  const agents = buildPipelineAgents(provider);
  const pipeline = new RecoveryPipeline(agents, { logger });

  if (options.transaction) {
    const transaction = transactions.find((t) => t.id === options.transaction);
    if (!transaction) {
      return errorResult("pipeline", `Transaction "${options.transaction}" was not found in "${filePath}".`);
    }

    const facts = buildPipelineTransactionFacts(transaction, transactions, options.seed);
    const result = await pipeline.run(facts);
    await db.auditEvents.append(buildPipelineAuditEvent(transaction, result));

    logger.log("info", "pipeline run completed", {
      transactionId: transaction.id,
      status: result.status,
    });

    return { status: "pipeline_single", command: "pipeline", result, json: options.json };
  }

  const factsList = transactions.map((t) => buildPipelineTransactionFacts(t, transactions, options.seed));
  const batchPipeline = new BatchRecoveryPipeline(pipeline);
  const batch = await batchPipeline.run(factsList);

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    const result = batch.results[i];
    if (transaction && result) {
      await db.auditEvents.append(buildPipelineAuditEvent(transaction, result));
    }
  }

  logger.log("info", "batch pipeline run completed", {
    total: batch.total,
    completed: batch.completed,
    blocked: batch.blocked,
    skipped: batch.skipped,
    failed: batch.failed,
  });

  return { status: "pipeline_batch", command: "pipeline", file: filePath, batch, json: options.json };
}
