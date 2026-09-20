import { Command } from "commander";
import { CliLogger, parseOptions, printReportJson, printReportTable, printResult } from "../utils/index.js";
import { reportOptionsSchema, runReport } from "../services/index.js";

export function reportCommand(): Command {
  return new Command("report")
    .description("Generate a merchant-facing revenue recovery report (SIMULATION only)")
    .option("--format <format>", "output format: table or json", "table")
    .option(
      "--file <path>",
      "path to a transaction data file to report on (defaults to the bundled sample dataset)",
    )
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(reportOptionsSchema, rawOptions);
      const result = await runReport(options, new CliLogger());

      if (result.status === "reported") {
        if (result.format === "json") printReportJson(result);
        else printReportTable(result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
