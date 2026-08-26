import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const simulateOptionsSchema = z.object({
  count: z.coerce.number().int().positive().optional().default(10),
});
export type SimulateOptions = z.infer<typeof simulateOptionsSchema>;

/**
 * Will eventually drive @recoverai/integrations' PaymentSimulator and
 * RecoveryActionSimulator across a batch of transactions to exercise the
 * full pipeline without real payment credentials.
 */
export async function runSimulate(
  options: SimulateOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "simulate service invoked", { count: options.count });
  return notImplemented(
    "simulate",
    `Will simulate ${options.count} transaction(s) using @recoverai/integrations' PaymentSimulator.`,
  );
}
