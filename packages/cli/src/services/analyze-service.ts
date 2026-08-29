import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { analyzeTransactions, ingestFile } from "@recoverai/analysis";
import { createPrismaDatabase } from "@recoverai/database";
import { errorResult, type CommandResult } from "./types.js";

/** Used when no --file is given — the canonical, always-available fixture dataset. */
export const DEFAULT_ANALYZE_FILE = "data/samples/transactions.json";

export const analyzeOptionsSchema = z.object({
  file: z.string().optional(),
  json: z.boolean().optional().default(false),
});
export type AnalyzeOptions = z.infer<typeof analyzeOptionsSchema>;

/**
 * Runs the full ingestion -> classification -> risk-scoring ->
 * prioritization pipeline against a file (defaulting to the bundled
 * sample dataset) and returns the resulting `AnalysisResult`. Ingests into
 * the durable store, same as `ingest-service` — see there for what that
 * means for cross-invocation persistence.
 */
export async function runAnalyze(
  options: AnalyzeOptions,
  logger: Logger,
): Promise<CommandResult> {
  const filePath = options.file ?? DEFAULT_ANALYZE_FILE;
  logger.log("debug", "analyze service invoked", { file: filePath, json: options.json });

  const db = createPrismaDatabase();

  let transactions;
  try {
    ({ transactions } = await ingestFile({ filePath, repository: db.transactions }));
  } catch (error) {
    return errorResult("analyze", error instanceof Error ? error.message : String(error));
  }

  if (transactions.length === 0) {
    return errorResult(
      "analyze",
      `No valid transactions were found in "${filePath}" — nothing to analyze.`,
    );
  }

  const result = analyzeTransactions(transactions);
  return { status: "analyzed", command: "analyze", result, json: options.json };
}
