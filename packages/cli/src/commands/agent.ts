import { Command } from "commander";
import {
  CliLogger,
  parseOptions,
  printAgentVerified,
  printAgentVerifiedJson,
  printDetection,
  printDetectionJson,
  printDiagnosis,
  printDiagnosisJson,
  printPrioritization,
  printPrioritizationJson,
  printRecoveryExecuted,
  printRecoveryExecutedJson,
  printResult,
  printStrategy,
  printStrategyJson,
} from "../utils/index.js";
import { agentOptionsSchema, runAgent } from "../services/index.js";

export function agentCommand(): Command {
  return new Command("agent")
    .description("Run or inspect the RecoverAI agent pipeline")
    .option(
      "-s, --stage <stage>",
      "pipeline stage to run: detection|diagnosis|prioritization|strategy|recovery_execution|verification",
    )
    .option(
      "-t, --transaction <id>",
      "transaction id to run the stage against (required for --stage diagnosis|strategy)",
    )
    .option(
      "-f, --file <path>",
      "path to a transaction data file (defaults to the bundled sample dataset)",
    )
    .option("--json", "print machine-readable JSON instead of a formatted report")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(agentOptionsSchema, rawOptions);
      const result = await runAgent(options, new CliLogger());

      if (result.status === "detected") {
        if (result.json) printDetectionJson(result);
        else printDetection(result);
        return;
      }

      if (result.status === "prioritized") {
        if (result.json) printPrioritizationJson(result);
        else printPrioritization(result);
        return;
      }

      if (result.status === "diagnosed") {
        if (result.json) printDiagnosisJson(result);
        else printDiagnosis(result);
        return;
      }

      if (result.status === "strategized") {
        if (result.json) printStrategyJson(result);
        else printStrategy(result);
        return;
      }

      if (result.status === "recovery_executed") {
        if (result.json) printRecoveryExecutedJson(result);
        else printRecoveryExecuted(result);
        return;
      }

      if (result.status === "agent_verified") {
        if (result.json) printAgentVerifiedJson(result);
        else printAgentVerified(result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}
