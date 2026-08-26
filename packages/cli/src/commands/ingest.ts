import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { ingestOptionsSchema, runIngest } from "../services/index.js";

export function ingestCommand(): Command {
  return new Command("ingest")
    .description("Ingest transaction data from a file or source")
    .requiredOption("-f, --file <path>", "path to a transaction data file (JSON)")
    .option("-m, --merchant <id>", "merchant id to scope ingestion to")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(ingestOptionsSchema, rawOptions);
      const result = await runIngest(options, new CliLogger());
      printResult(result);
    });
}
