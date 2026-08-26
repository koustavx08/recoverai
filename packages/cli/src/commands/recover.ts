import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { recoverOptionsSchema, runRecover } from "../services/index.js";

export function recoverCommand(): Command {
  return new Command("recover")
    .description("Execute a bounded recovery action for a transaction")
    .requiredOption("-t, --transaction <id>", "transaction id to recover")
    .option("--dry-run", "select a strategy without executing it")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(recoverOptionsSchema, rawOptions);
      const result = await runRecover(options, new CliLogger());
      printResult(result);
    });
}
