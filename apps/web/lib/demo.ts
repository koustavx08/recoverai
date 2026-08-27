import { ingestFile, type NormalizedTransaction } from "@recoverai/analysis";
import { BatchRecoveryPipeline, RecoveryPipeline, type PipelineResult } from "@recoverai/agents";
import { createInMemoryDatabase } from "@recoverai/database";
import type { Logger } from "@recoverai/core";
import { buildFactsList, buildPipelineAgents, repoDataPath, resolveProvider } from "./pipeline-runtime";

const DEMO_DATA_PATH = repoDataPath("demo", "scenarios.json");

/** Transactions carrying this scenario tag exist only to give another
 * transaction realistic customer history — never shown as a demo case. */
const SUPPORTING_SCENARIO_TAG = "demo_history_support";

const consoleLogger: Logger = {
  log(level, message, context) {
    if (level === "warn" || level === "error") console.error(`[demo:${level}]`, message, context ?? {});
  },
};

export interface DemoScenarioView {
  readonly id: string;
  readonly title: string;
  readonly narrative: string;
  readonly amount: NormalizedTransaction["amount"];
  readonly result: PipelineResult;
}

export interface DemoPipelineView {
  readonly file: string;
  readonly scenarios: readonly DemoScenarioView[];
}

/**
 * Server-only: runs the full six-stage `RecoveryPipeline` (SIMULATION only)
 * over the curated demo dataset (`data/demo/scenarios.json`) and pairs each
 * named scenario's real `PipelineResult` with its narrative copy. The
 * pipeline itself is identical to the one `loadPortfolioPipeline()` and
 * `recoverai pipeline run` use — nothing here is a fabricated or
 * hand-written outcome.
 */
export async function loadDemoScenarios(): Promise<DemoPipelineView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: DEMO_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;

    const provider = resolveProvider();
    const agents = buildPipelineAgents(provider);
    const pipeline = new RecoveryPipeline(agents, { logger: consoleLogger });
    const batchPipeline = new BatchRecoveryPipeline(pipeline);

    const factsList = buildFactsList(transactions);
    const batch = await batchPipeline.run(factsList);

    const resultsById = new Map(batch.results.map((result) => [result.transactionId, result]));
    const scenarios: DemoScenarioView[] = [];

    for (const transaction of transactions) {
      const scenarioTag = transaction.metadata?.scenario;
      if (typeof scenarioTag !== "string" || scenarioTag === SUPPORTING_SCENARIO_TAG) continue;

      const result = resultsById.get(transaction.id);
      if (!result) continue;

      scenarios.push({
        id: transaction.id,
        title: typeof transaction.metadata?.title === "string" ? transaction.metadata.title : transaction.id,
        narrative: typeof transaction.metadata?.narrative === "string" ? transaction.metadata.narrative : "",
        amount: transaction.amount,
        result,
      });
    }

    return { file: "data/demo/scenarios.json", scenarios };
  } catch {
    return null;
  }
}
