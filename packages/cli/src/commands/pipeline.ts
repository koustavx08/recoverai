import { Command } from "commander";
import {
  CliLogger,
  parseOptions,
  printPipelineBatch,
  printPipelineBatchJson,
  printPipelineSingle,
  printPipelineSingleJson,
  printResult,
} from "../utils/index.js";
import { pipelineRunOptionsSchema, runPipeline } from "../services/index.js";

function pipelineRunCommand(): Command {
  return new Command("run")
    .description(
      "Run the full detect -> prioritize -> diagnose -> strategize -> simulate -> verify pipeline (SIMULATION only)",
    )
    .option(
      "-t, --transaction <id>",
      "run the full pipeline for a single transaction id (omit for batch mode over the whole file)",
    )
    .option(
      "-f, --file <path>",
      "path to a transaction data file — the single transaction to look up, or the whole batch to process (defaults to the bundled sample dataset)",
    )
    .option("--json", "print machine-readable JSON instead of a formatted report")
    .option("--seed <seed>", "explicit seed for the deterministic simulator")
    .action(async (rawOptions: unknown) => {
      const options = parseOptions(pipelineRunOptionsSchema, rawOptions);
      const result = await runPipeline(options, new CliLogger());

      if (result.status === "pipeline_single") {
        if (result.json) printPipelineSingleJson(result);
        else printPipelineSingle(result);
        return;
      }
      if (result.status === "pipeline_batch") {
        if (result.json) printPipelineBatchJson(result);
        else printPipelineBatch(result);
        return;
      }

      printResult(result);
      if (result.status === "error") process.exitCode = 1;
    });
}

export function pipelineCommand(): Command {
  const command = new Command("pipeline").description(
    "Run the full RecoverAI recovery pipeline end to end — detection through verification (SIMULATION only, never live)",
  );
  command.addCommand(pipelineRunCommand());
  return command;
}
