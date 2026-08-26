import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const agentOptionsSchema = z.object({
  stage: z
    .enum([
      "detection",
      "diagnosis",
      "prioritization",
      "strategy_selection",
      "recovery_execution",
      "verification",
    ])
    .optional(),
});
export type AgentOptions = z.infer<typeof agentOptionsSchema>;

/**
 * Will eventually invoke a single stage (or the full pipeline) of
 * @recoverai/agents' RecoveryPipeline for debugging and manual inspection.
 */
export async function runAgent(
  options: AgentOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "agent service invoked", { stage: options.stage ?? "all" });
  return notImplemented(
    "agent",
    options.stage
      ? `Will run the "${options.stage}" agent pipeline stage.`
      : "Will run the full agent pipeline (detection through verification).",
  );
}
