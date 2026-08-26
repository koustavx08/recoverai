import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { runSimulate, simulateOptionsSchema } from "../services/index.js";

export function simulateCommand(): Command {
  return new Command("simulate")
    .description("Simulate payment and recovery scenarios without real credentials")
    .option("-c, --count <n>", "number of transactions to simulate", "10")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(simulateOptionsSchema, rawOptions);
      const result = await runSimulate(options, new CliLogger());
      printResult(result);
    });
}
