import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { notImplemented, type CommandResult } from "./types.js";

export const reportOptionsSchema = z.object({
  format: z.enum(["table", "json"]).optional().default("table"),
});
export type ReportOptions = z.infer<typeof reportOptionsSchema>;

/**
 * Will eventually aggregate RevenueRisk, RecoveryAction, and AuditEvent
 * data into a merchant-facing recovery report.
 */
export async function runReport(
  options: ReportOptions,
  logger: Logger,
): Promise<CommandResult> {
  logger.log("debug", "report service invoked", { format: options.format });
  return notImplemented("report", `Will generate a ${options.format} recovery report.`);
}
