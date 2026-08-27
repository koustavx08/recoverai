import { computePortfolioMetrics, type PortfolioMetrics } from "./portfolio-metrics.js";
import type { RecoveryPipeline } from "./recovery-pipeline.js";
import type { PipelineResult, PipelineTransactionFacts } from "./pipeline-types.js";

export interface BatchPipelineResult {
  readonly total: number;
  readonly completed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly failed: number;
  readonly results: readonly PipelineResult[];
  readonly metrics: PortfolioMetrics;
}

/**
 * Runs `RecoveryPipeline.run()` over a batch of transactions and aggregates
 * the results into portfolio-level metrics. Sequential by default — no
 * uncontrolled parallelism, and every result is fully deterministic given
 * the same input facts and seeds (see `RecoveryExecutionSimulator`). One
 * transaction's internal failure never aborts the batch: `RecoveryPipeline.
 * run()` itself never throws, so a `failed` `PipelineResult` for one
 * transaction simply appears in `results` like any other outcome. Never
 * causes a real external payment call — every execution stays
 * simulation-only, exactly as it is for a single transaction.
 */
export class BatchRecoveryPipeline {
  constructor(private readonly pipeline: RecoveryPipeline) {}

  async run(factsList: readonly PipelineTransactionFacts[]): Promise<BatchPipelineResult> {
    const results: PipelineResult[] = [];
    for (const facts of factsList) {
      results.push(await this.pipeline.run(facts));
    }

    let completed = 0;
    let blocked = 0;
    let skipped = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "completed") completed++;
      else if (result.status === "blocked") blocked++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    }

    return {
      total: results.length,
      completed,
      blocked,
      skipped,
      failed,
      results,
      metrics: computePortfolioMetrics(results),
    };
  }
}
