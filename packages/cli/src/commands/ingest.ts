import { Command } from "commander";
import {
  CliLogger,
  parseOptions,
  printIngestionSummary,
  printResult,
} from "../utils/index.js";
import { ingestOptionsSchema, runIngest } from "../services/index.js";

export function ingestCommand(): Command {
  return new Command("ingest")
    .description("Ingest transaction data from a JSON or CSV file")
    .requiredOption(
      "-f, --file <path>",
      "path to a transaction data file (.json or .csv)",
    )
    .option(
      "-m, --merchant <id>",
      "merchant id to scope ingestion to (reserved for future use)",
    )
    .option(
      "--format <format>",
      "force the source format instead of inferring it from the file extension: json|csv",
    )
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(ingestOptionsSchema, rawOptions);
      const result = await runIngest(options, new CliLogger());
      if (result.status === "ingested") {
        // Rejected rows are reported in the summary, not treated as a hard command failure.
        printIngestionSummary(result.summary);
        return;
      }
      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
