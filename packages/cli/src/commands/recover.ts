import { Command } from "commander";
import { CliLogger, parseOptions, printRecovery, printRecoveryJson, printResult } from "../utils/index.js";
import { recoverOptionsSchema, runRecover } from "../services/index.js";

export function recoverCommand(): Command {
  return new Command("recover")
    .description("Run a SIMULATED recovery execution for a transaction — no real payment action occurs")
    .requiredOption("-t, --transaction <id>", "transaction id to recover")
    .option(
      "-f, --file <path>",
      "path to a transaction data file (defaults to the bundled sample dataset)",
    )
    .option("--json", "print machine-readable JSON instead of a formatted report")
    .option(
      "--seed <seed>",
      "explicit seed for the deterministic simulator (same transaction + strategy + seed always reproduces the same result)",
    )
    .option(
      "--live",
      "rejected — live recovery execution is not implemented; this command only ever runs in simulation mode",
    )
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(recoverOptionsSchema, rawOptions);
      const result = await runRecover(options, new CliLogger());

      if (result.status === "recovered") {
        if (result.json) printRecoveryJson(result);
        else printRecovery(result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
