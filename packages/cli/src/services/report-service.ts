import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { ingestFile, type NormalizedTransaction } from "@recoverai/analysis";
import { BatchRecoveryPipeline, RecoveryPipeline } from "@recoverai/agents";
import { createPrismaDatabase } from "@recoverai/database";
import {
  DEFAULT_PIPELINE_FILE,
  buildPipelineAgents,
  buildPipelineTransactionFacts,
  resolveAIProvider,
} from "./pipeline-context.js";
import { errorResult, type CommandResult } from "./types.js";

export const reportOptionsSchema = z.object({
  format: z.enum(["table", "json"]).optional().default("table"),
  file: z.string().optional(),
});
export type ReportOptions = z.infer<typeof reportOptionsSchema>;

/**
 * Generates a merchant-facing revenue recovery report: runs the real,
 * complete `RecoveryPipeline` (detection through verification) over every
 * transaction in the given (or bundled sample) dataset via
 * `BatchRecoveryPipeline`, and reports the resulting `PortfolioMetrics` —
 * revenue at risk, SIMULATED recovered amount, recovery rate, and
 * stage-by-stage breakdowns. Every figure is computed from an actual
 * pipeline run against real ingested data; nothing is fabricated.
 */
export async function runReport(options: ReportOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "report service invoked", { format: options.format, file: options.file });

  const filePath = options.file ?? DEFAULT_PIPELINE_FILE;
  const provider = resolveAIProvider();
  const db = createPrismaDatabase();

  let transactions: readonly NormalizedTransaction[];
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult("report", error instanceof Error ? error.message : String(error));
  }

  if (transactions.length === 0) {
    return errorResult("report", `No valid transactions were found in "${filePath}" — nothing to report on.`);
  }

  const agents = buildPipelineAgents(provider);
  const pipeline = new RecoveryPipeline(agents, { logger });
  const factsList = transactions.map((t) => buildPipelineTransactionFacts(t, transactions));
  const batchPipeline = new BatchRecoveryPipeline(pipeline);
  const batch = await batchPipeline.run(factsList);

  logger.log("info", "report generated", {
    file: filePath,
    total: batch.total,
    format: options.format,
  });

  return { status: "reported", command: "report", file: filePath, batch, format: options.format };
}
