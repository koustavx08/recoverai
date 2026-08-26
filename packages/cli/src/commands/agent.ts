import { Command } from "commander";
import { CliLogger, parseOptions, printResult } from "../utils/index.js";
import { agentOptionsSchema, runAgent } from "../services/index.js";

export function agentCommand(): Command {
  return new Command("agent")
    .description("Run or inspect the RecoverAI agent pipeline")
    .option(
      "-s, --stage <stage>",
      "pipeline stage to run: detection|diagnosis|prioritization|strategy_selection|recovery_execution|verification",
    )
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(agentOptionsSchema, rawOptions);
      const result = await runAgent(options, new CliLogger());
      printResult(result);
    });
}
