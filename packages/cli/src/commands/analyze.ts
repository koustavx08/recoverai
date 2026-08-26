import { Command } from "commander";
import {
  CliLogger,
  parseOptions,
  printAnalysisJson,
  printAnalysisTable,
  printResult,
} from "../utils/index.js";
import { analyzeOptionsSchema, runAnalyze } from "../services/index.js";

export function analyzeCommand(): Command {
  return new Command("analyze")
    .description(
      "Run the deterministic revenue-risk analysis pipeline over a transaction dataset",
    )
    .option(
      "-f, --file <path>",
      "path to a transaction data file (defaults to the bundled sample dataset)",
    )
    .option("--json", "print machine-readable JSON instead of a table")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(analyzeOptionsSchema, rawOptions);
      const result = await runAnalyze(options, new CliLogger());

      if (result.status === "analyzed") {
        if (result.json) printAnalysisJson(result.result);
        else printAnalysisTable(result.result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
