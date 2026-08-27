import { ingestFile, type NormalizedTransaction } from "@recoverai/analysis";
import { BatchRecoveryPipeline, RecoveryPipeline, type PipelineResult } from "@recoverai/agents";
import { createInMemoryDatabase } from "@recoverai/database";
import { brand, type AuditEvent, type Logger } from "@recoverai/core";
import { buildFactsList, buildPipelineAgents, repoDataPath, resolveProvider } from "./pipeline-runtime";

const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[audit:${level}]`, message, context ?? {});
  },
};

/**
 * Turns one real `PipelineResult` into the `AuditEvent`s a completed run of
 * it would produce — one per stage that actually ran. All stages of one
 * transaction share that transaction's pipeline `completedAt` timestamp
 * (the orchestrator only records start/end for the whole run, not a
 * timestamp per stage), so ordering within a transaction is stage order,
 * not a finer-grained clock reading. Every field is read from the real
 * stage output — nothing here is invented for display.
 */
function buildAuditEvents(transaction: NormalizedTransaction, result: PipelineResult): AuditEvent[] {
  const events: AuditEvent[] = [];
  const occurredAt = result.metadata.completedAt as AuditEvent["occurredAt"];
  const merchantId = transaction.merchantId;
  const transactionId = transaction.id;

  const push = (
    stageKey: string,
    type: AuditEvent["type"],
    actorId: string,
    summary: string,
    data: AuditEvent["data"],
  ) => {
    events.push({
      id: brand<string, "AuditEventId">(`${transactionId}:${stageKey}`),
      type,
      merchantId,
      transactionId,
      actorType: "agent",
      actorId,
      summary,
      data,
      occurredAt,
    });
  };

  if (result.detection) {
    const { detected, actionable, severity, reason } = result.detection.result;
    push(
      "detection",
      "agent_decision_recorded",
      "detection-agent",
      detected
        ? `Detection found this transaction ${actionable ? "actionable" : "not actionable"} (severity: ${severity}).`
        : "Detection found nothing to act on.",
      { detected, actionable, severity, reason },
    );
  }

  if (result.prioritization) {
    const { priority, score } = result.prioritization.result;
    push(
      "prioritization",
      "risk_assessed",
      "prioritization-agent",
      `Prioritized as "${priority}" (score ${score}/100).`,
      { priority, score },
    );
  }

  if (result.diagnosis) {
    const { category, confidence } = result.diagnosis.diagnosis;
    const { mode } = result.diagnosis.meta;
    push(
      "diagnosis",
      "agent_decision_recorded",
      "diagnosis-agent",
      `Diagnosis agent produced a "${category}" diagnosis (${mode} mode).`,
      { category, confidence, mode },
    );
  }

  if (result.strategy) {
    const { strategy, requiresHumanApproval } = result.strategy.decision;
    const { mode } = result.strategy.meta;
    push(
      "strategy",
      "strategy_selected",
      "strategy-agent",
      `Strategy agent selected "${strategy}" (${mode} mode).`,
      { strategy, requiresHumanApproval, mode },
    );
  }

  if (result.execution) {
    const { action, outcome, simulationMode, blockedReason } = result.execution.result;
    push(
      "execution",
      "recovery_action_executed",
      "recovery-agent",
      `Recovery agent ${outcome === "success" || outcome === "failure" ? "simulated" : "attempted"} "${action}" — outcome: ${outcome}.`,
      { action, outcome, simulationMode, blockedReason: blockedReason ?? null },
    );
  }

  if (result.verification) {
    const { verified, reasons } = result.verification.verification;
    push(
      "verification",
      "recovery_verified",
      "verification-agent",
      `Verification ${verified ? "passed" : "failed"} for this recovery execution.`,
      { verified, reasonCount: reasons.length },
    );
  }

  return events;
}

export interface AuditTrailView {
  readonly file: string;
  readonly events: readonly AuditEvent[];
}

/**
 * Server-only: runs the real `RecoveryPipeline` over the bundled sample
 * dataset and derives the audit trail every stage that ran would have
 * produced — the same shape `recoverai pipeline run` and `recoverai
 * recover` persist via `AuditEventRepository`, just computed fresh per
 * request since there is no cross-process store yet.
 */
export async function loadAuditTrail(): Promise<AuditTrailView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: SAMPLE_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;

    const provider = resolveProvider();
    const agents = buildPipelineAgents(provider);
    const pipeline = new RecoveryPipeline(agents, { logger: consoleLogger });
    const batchPipeline = new BatchRecoveryPipeline(pipeline);

    const factsList = buildFactsList(transactions);
    const batch = await batchPipeline.run(factsList);

    const transactionsById = new Map(transactions.map((t) => [t.id, t]));
    const events = batch.results.flatMap((result) => {
      const transaction = transactionsById.get(result.transactionId);
      return transaction ? buildAuditEvents(transaction, result) : [];
    });

    const sorted = [...events].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    return { file: "data/samples/transactions.json", events: sorted };
  } catch {
    return null;
  }
}
