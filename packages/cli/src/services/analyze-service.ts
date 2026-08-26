import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const analyzeOptionsSchema = z.object({
  transaction: z.string().optional(),
  all: z.boolean().optional().default(false),
});
export type AnalyzeOptions = z.infer<typeof analyzeOptionsSchema>;

/**
 * Will eventually run the Detection -> Diagnosis -> Prioritization agent
 * stages (via @recoverai/agents' RecoveryPipeline) to produce RevenueRisk
 * assessments.
 */
export async function runAnalyze(
  options: AnalyzeOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "analyze service invoked", options);
  return notImplemented(
    "analyze",
    "Will run risk analysis via the agent pipeline (detection, diagnosis, prioritization).",
  );
}
