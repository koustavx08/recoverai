#!/usr/bin/env node
import { Command } from "commander";
import {
  agentCommand,
  analyzeCommand,
  ingestCommand,
  initCommand,
  pipelineCommand,
  recoverCommand,
  reportCommand,
  simulateCommand,
} from "./commands/index.js";
import { CliValidationError } from "./utils/index.js";

const CLI_VERSION = "0.1.0";

const program = new Command();

program
  .name("recoverai")
  .description("RecoverAI\n\nAI-powered revenue recovery engine")
  .version(CLI_VERSION);

program.addCommand(initCommand());
program.addCommand(ingestCommand());
program.addCommand(analyzeCommand());
program.addCommand(simulateCommand());
program.addCommand(recoverCommand());
program.addCommand(reportCommand());
program.addCommand(agentCommand());
program.addCommand(pipelineCommand());

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CliValidationError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

void main();
