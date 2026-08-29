import { BatchRecoveryPipeline, RecoveryPipeline, type BatchPipelineResult } from "@recoverai/agents";
import { createPrismaDatabase } from "@recoverai/database";
import type { Logger } from "@recoverai/core";
import {
  buildFactsList,
  buildPipelineAgents,
  loadPersistedTransactions,
  PERSISTED_SOURCE_LABEL,
  repoDataPath,
  resolveProvider,
} from "./pipeline-runtime";

const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

/** No-op-ish logger: server console only, mirrors lib/diagnosis.ts. */
const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[pipeline:${level}]`, message, context ?? {});
  },
};

export interface PortfolioPipelineView {
  readonly file: string;
  readonly batch: BatchPipelineResult;
}

/**
 * Server-only: runs the full six-stage `RecoveryPipeline` (SIMULATION only)
 * over every transaction persisted to the durable store (the bundled
 * sample dataset, seeded on every call, plus anything separately ingested
 * via `recoverai ingest`) and returns the aggregated `BatchPipelineResult`
 * — the same real pipeline `recoverai pipeline run` uses. Returns `null`
 * only if ingestion itself fails; an empty dataset is still a valid (if
 * empty) result.
 */
export async function loadPortfolioPipeline(): Promise<PortfolioPipelineView | null> {
  try {
    const db = createPrismaDatabase();
    const transactions = await loadPersistedTransactions(db, SAMPLE_DATA_PATH);
    if (transactions.length === 0) return null;

    const provider = resolveProvider();
    const agents = buildPipelineAgents(provider);
    const pipeline = new RecoveryPipeline(agents, { logger: consoleLogger });
    const batchPipeline = new BatchRecoveryPipeline(pipeline);

    const factsList = buildFactsList(transactions);
    const batch = await batchPipeline.run(factsList);

    return { file: PERSISTED_SOURCE_LABEL, batch };
  } catch {
    return null;
  }
}
