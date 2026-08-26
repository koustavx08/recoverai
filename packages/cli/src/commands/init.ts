import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { initOptionsSchema, runInit } from "../services/index.js";

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize RecoverAI in the current project")
    .option("-f, --force", "overwrite existing configuration if present")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(initOptionsSchema, rawOptions);
      const result = await runInit(options, new CliLogger());
      printResult(result);
    });
}
