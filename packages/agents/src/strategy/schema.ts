import { z } from "zod";
import type { RecoveryStrategyType } from "@recoverai/core";
import { evidenceItemSchema } from "../diagnosis/schema.js";

/**
 * The bounded universe of strategies the Strategy Agent may ever select
 * from — mirrors `@recoverai/core`'s `RecoveryStrategyType` exactly (kept
 * in sync by `satisfies` below rather than duplicated by hand). This is the
 * schema-level bound; `StrategyPolicy` narrows it further, per diagnosis
 * category, to the actual *allowed* candidate set for a given decision.
 */
export const RECOVERY_STRATEGY_TYPES = [
  "retry_payment",
  "send_payment_link",
  "switch_payment_method",
  "offer_installments",
  "manual_followup",
  "wait_and_retry",
  "manual_review",
  "no_action",
] as const satisfies readonly RecoveryStrategyType[];
export const recoveryStrategyTypeSchema = z.enum(RECOVERY_STRATEGY_TYPES);

export const strategyMetadataSchema = z.object({
  mode: z.enum(["deterministic", "llm"]),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  agentVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional(),
});
export type StrategyMetadata = z.infer<typeof strategyMetadataSchema>;

/**
 * The final, structured strategy decision — the only artifact either code
 * path (deterministic or LLM-assisted) may hand back to a caller.
 * `supportingEvidence` always contains full `EvidenceItem` objects sourced
 * from the deterministic evidence bundle already produced by the diagnosis
 * stage (plus a few strategy-specific deterministic additions) — never
 * model-authored content. This is a *decision*, not an action: nothing
 * about this shape can execute anything.
 */
export const strategyDecisionSchema = z.object({
  transactionId: z.string().min(1),
  strategy: recoveryStrategyTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  supportingEvidence: z.array(evidenceItemSchema).min(1),
  /** Plain-language description of what this strategy might achieve — never a guaranteed or fabricated recovered amount. */
  expectedOutcome: z.string().min(1),
  /** Deterministic guardrails applied when narrowing the candidate set — always policy-derived, never model-authored. */
  constraints: z.array(z.string()),
  requiresHumanApproval: z.boolean(),
  limitations: z.array(z.string()),
  metadata: strategyMetadataSchema,
});
export type StrategyDecision = z.infer<typeof strategyDecisionSchema>;

/**
 * The narrower schema actually requested FROM the model — references
 * evidence by id only, and `strategy` is validated against the
 * request-specific *allowed* set post-hoc (see `validation.ts`), not just
 * against the full bounded enum here.
 */
export const llmStrategyResponseSchema = z.object({
  transactionId: z.string().min(1),
  strategy: recoveryStrategyTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  expectedOutcome: z.string().min(1),
  limitations: z.array(z.string()),
});
export type LlmStrategyResponse = z.infer<typeof llmStrategyResponseSchema>;
