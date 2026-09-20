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

/**
 * `DEBUG=1`/`DEBUG=true` (any Node convention already familiar to CLI
 * users) opts into the raw stack trace for unexpected errors; without it,
 * an unhandled exception prints one clean line instead of a Node stack
 * trace — this is a local CLI run by the merchant/operator against their
 * own machine, so an unexpected bug should be legible, not alarming. This
 * is a UX fix only, not a security boundary: it does not change what
 * happens for `CliValidationError`, which already prints a clean message,
 * and does not suppress or alter which errors are thrown.
 */
function isDebugEnabled(): boolean {
  const value = process.env.DEBUG;
  return value === "1" || value?.toLowerCase() === "true";
}

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CliValidationError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    if (isDebugEnabled()) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unexpected error: ${message}`);
    console.error("Re-run with DEBUG=1 for the full stack trace.");
    process.exitCode = 1;
  }
}

void main();
