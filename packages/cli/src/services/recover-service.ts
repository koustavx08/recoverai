import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const recoverOptionsSchema = z.object({
  transaction: z.string().min(1, "transaction is required, e.g. --transaction txn_00002"),
  dryRun: z.boolean().optional().default(false),
});
export type RecoverOptions = z.infer<typeof recoverOptionsSchema>;

/**
 * Will eventually select a recovery strategy and execute a bounded
 * RecoveryAction via the agent pipeline's strategy/recovery/verification
 * stages.
 */
export async function runRecover(
  options: RecoverOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "recover service invoked", options);
  return notImplemented(
    "recover",
    `Will select a strategy and execute recovery for transaction "${options.transaction}".`,
  );
}
