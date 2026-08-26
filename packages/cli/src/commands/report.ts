import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { reportOptionsSchema, runReport } from "../services/index.js";

export function reportCommand(): Command {
  return new Command("report")
    .description("Generate a revenue recovery report")
    .option("-f, --format <format>", "output format: table or json", "table")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(reportOptionsSchema, rawOptions);
      const result = await runReport(options, new CliLogger());
      printResult(result);
    });
}
