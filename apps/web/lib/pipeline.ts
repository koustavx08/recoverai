import { ingestFile } from "@recoverai/analysis";
import { BatchRecoveryPipeline, RecoveryPipeline, type BatchPipelineResult } from "@recoverai/agents";
import { createInMemoryDatabase } from "@recoverai/database";
import type { Logger } from "@recoverai/core";
import { buildFactsList, buildPipelineAgents, repoDataPath, resolveProvider } from "./pipeline-runtime";

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
 * over the bundled sample dataset and returns the aggregated
 * `BatchPipelineResult` — the same real pipeline `recoverai pipeline run`
 * uses. Returns `null` only if ingestion itself fails; an empty dataset is
 * still a valid (if empty) result.
 */
export async function loadPortfolioPipeline(): Promise<PortfolioPipelineView | null> {
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

    return { file: "data/samples/transactions.json", batch };
  } catch {
    return null;
  }
}
