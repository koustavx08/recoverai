import type { CommandResult } from "../services/types.js";

/**
 * Prints a command's result in a consistent, scriptable-friendly format.
 * Only handles the simple status kinds — "ingested" and "analyzed" carry
 * structured reports rendered by `report-printer.ts` instead, since a
 * single-line message doesn't fit a multi-section report.
 */
export function printResult(result: CommandResult): void {
  if (result.status === "not_implemented") {
    console.info(`recoverai ${result.command}: Not implemented yet.`);
    if (result.detail) console.info(`  ${result.detail}`);
    return;
  }

  if (result.status === "error") {
    console.error(`recoverai ${result.command}: ${result.message}`);
    return;
  }

  if (result.status === "ok") {
    console.info(`recoverai ${result.command}: ${result.message}`);
  }
}
