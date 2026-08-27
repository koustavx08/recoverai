import { z } from "zod";
import type { RiskPriority } from "@recoverai/core";

/** Mirrors `@recoverai/core`'s `RiskPriority` exactly — the bounded public priority tier. Never an arbitrary numeric value at the API boundary; `score` below is an internal, explanatory number only. */
export const RISK_PRIORITIES = ["critical", "high", "medium", "low"] as const satisfies readonly RiskPriority[];
export const riskPrioritySchema = z.enum(RISK_PRIORITIES);

/**
 * The bounded, structured output of the Prioritization stage —
 * deterministic, no model involved. `priority` is the public API (always
 * one of `RiskPriority`); `score` is an internal 0–100 composite kept only
 * for sorting/display, never the authoritative value. `factors` is always
 * generated from deterministic rules, never an LLM.
 */
export const prioritizationResultSchema = z.object({
  transactionId: z.string().min(1),
  priority: riskPrioritySchema,
  score: z.number().min(0).max(100),
  factors: z.array(z.string()).min(1),
  explanation: z.string().min(1),
});
export type PrioritizationResult = z.infer<typeof prioritizationResultSchema>;
