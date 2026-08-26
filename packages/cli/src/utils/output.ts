import type { CommandResult } from "../services/types.js";

/** Prints a command's result in a consistent, scriptable-friendly format. */
export function printResult(result: CommandResult): void {
  if (result.status === "not_implemented") {
    console.info(`recoverai ${result.command}: Not implemented yet.`);
    if (result.detail) console.info(`  ${result.detail}`);
    return;
  }

  console.info(`recoverai ${result.command}: ${result.message}`);
}
