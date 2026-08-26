import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { ingestFile } from "@recoverai/analysis";
import { createInMemoryDatabase } from "@recoverai/database";
import { errorResult, type CommandResult } from "./types.js";

export const ingestOptionsSchema = z.object({
  file: z.string().min(1, "file is required, e.g. --file data/samples/transactions.json"),
  merchant: z.string().optional(),
  format: z.enum(["json", "csv"]).optional(),
});
export type IngestOptions = z.infer<typeof ingestOptionsSchema>;

/**
 * Reads, validates, and normalizes a transaction file through
 * `@recoverai/analysis`'s ingestion pipeline, persisting valid records via
 * the repository abstraction. Each CLI invocation ingests into a fresh
 * in-memory store — there is no cross-process persistence yet (see
 * README), so this doubles as a validation/preview tool as much as a
 * literal "load" operation.
 */
export async function runIngest(
  options: IngestOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "ingest service invoked", {
    file: options.file,
    format: options.format,
  });

  const db = createInMemoryDatabase();

  try {
    const { summary } = await ingestFile({
      filePath: options.file,
      format: options.format,
      repository: db.transactions,
    });
    return { status: "ingested", command: "ingest", summary };
  } catch (error) {
    return errorResult("ingest", error instanceof Error ? error.message : String(error));
  }
}
