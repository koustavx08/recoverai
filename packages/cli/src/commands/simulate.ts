import { Command } from "commander";
import { CliLogger, parseOptions, printResult, printSimulate, printSimulateJson } from "../utils/index.js";
import { runSimulate, simulateOptionsSchema } from "../services/index.js";

export function simulateCommand(): Command {
  return new Command("simulate")
    .description("Simulate payment scenarios via PaymentSimulator without real credentials")
    .option("-c, --count <n>", "number of transactions to simulate", "10")
    .option("--seed <seed>", "deterministic seed prefix for the simulated transaction ids")
    .option("--json", "print machine-readable JSON instead of a formatted report")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(simulateOptionsSchema, rawOptions);
      const result = await runSimulate(options, new CliLogger());

      if (result.status === "simulated") {
        if (options.json) printSimulateJson(result);
        else printSimulate(result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
