import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { analyzeOptionsSchema, runAnalyze } from "../services/index.js";

export function analyzeCommand(): Command {
  return new Command("analyze")
    .description("Analyze revenue risk for one or more transactions")
    .option("-t, --transaction <id>", "transaction id to analyze")
    .option("-a, --all", "analyze all ingested transactions")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(analyzeOptionsSchema, rawOptions);
      const result = await runAnalyze(options, new CliLogger());
      printResult(result);
    });
}
