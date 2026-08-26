import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const initOptionsSchema = z.object({
  force: z.boolean().optional().default(false),
});
export type InitOptions = z.infer<typeof initOptionsSchema>;

/**
 * Will eventually scaffold local RecoverAI project state (config file,
 * database bootstrap, provider selection). Structure only for now.
 */
export async function runInit(
  _options: InitOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "init service invoked");
  return notImplemented("init", "Will scaffold a local RecoverAI project configuration.");
}
