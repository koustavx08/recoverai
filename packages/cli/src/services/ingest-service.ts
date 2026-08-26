import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const ingestOptionsSchema = z.object({
  file: z.string().min(1, "file is required, e.g. --file data/samples/transactions.json"),
  merchant: z.string().optional(),
});
export type IngestOptions = z.infer<typeof ingestOptionsSchema>;

/**
 * Will eventually read a transaction data file (or connect to a live
 * source) and persist it via @recoverai/database's TransactionRepository.
 */
export async function runIngest(
  options: IngestOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "ingest service invoked", { file: options.file });
  return notImplemented("ingest", `Will ingest transactions from "${options.file}".`);
}
