import { z } from "zod";
import type { RecoveryActionType, RecoveryOutcome } from "@recoverai/core";
import { recoveryStrategyTypeSchema } from "../strategy/schema.js";

/**
 * Mirrors `@recoverai/core`'s `RecoveryActionType` exactly (kept in sync via
 * `satisfies`, not duplicated by hand) — the bounded set of concrete,
 * executable action kinds a strategy can map to. See `action-mapping.ts`
 * for the deterministic strategy -> action mapping; nothing upstream of
 * that mapping (including an LLM) ever chooses an action directly.
 */
export const RECOVERY_ACTION_TYPES = [
  "auto_retry",
  "notification_email",
  "notification_sms",
  "notification_whatsapp",
  "payment_link",
  "escalate_to_agent",
  "none",
] as const satisfies readonly RecoveryActionType[];
export const recoveryActionTypeSchema = z.enum(RECOVERY_ACTION_TYPES);

/**
 * Mirrors `@recoverai/core`'s `RecoveryOutcome` exactly. `success`/`failure`
 * are the only outcomes the simulator itself ever produces; `blocked` and
 * `not_executed` come from the deterministic execution policy (before the
 * simulator ever runs); `pending` marks a strategy that was allowed but
 * requires a human step (e.g. a manual follow-up) with no resolved
 * success/failure yet.
 */
export const RECOVERY_OUTCOMES = [
  "success",
  "failure",
  "pending",
  "blocked",
  "not_executed",
] as const satisfies readonly RecoveryOutcome[];
export const recoveryOutcomeSchema = z.enum(RECOVERY_OUTCOMES);

const moneySchema = z.object({
  amount: z.number(),
  currency: z.string().min(1),
});

/**
 * The bounded, policy-approved plan for one recovery execution attempt —
 * built entirely deterministically by `RecoveryExecutionPolicy`, never by a
 * model. `simulationMode` is a literal `true` in this phase: there is no
 * code path that can construct a plan claiming real execution.
 */
export const recoveryExecutionPlanSchema = z.object({
  executionId: z.string().min(1),
  transactionId: z.string().min(1),
  strategy: recoveryStrategyTypeSchema,
  action: recoveryActionTypeSchema,
  simulationMode: z.literal(true),
  constraints: z.array(z.string()),
  approvalRequired: z.boolean(),
});
export type RecoveryExecutionPlan = z.infer<typeof recoveryExecutionPlanSchema>;

/**
 * The result of one recovery execution attempt. Every field here is
 * produced deterministically — the simulator only ever resolves
 * success/failure for a policy-allowed, non-approval-required action; every
 * other outcome (blocked, not_executed, pending) is decided by the policy
 * layer before any probabilistic simulation runs.
 */
export const recoveryExecutionResultSchema = z.object({
  executionId: z.string().min(1),
  transactionId: z.string().min(1),
  strategy: recoveryStrategyTypeSchema,
  action: recoveryActionTypeSchema,
  outcome: recoveryOutcomeSchema,
  /** Always present — zero whenever `outcome` isn't `"success"`. Never an arbitrary value; see deterministic-execution.ts. */
  recoveredAmount: moneySchema,
  simulationMode: z.literal(true),
  executedAt: z.string().min(1),
  blockedReason: z.string().optional(),
  /** Flat primitives only, mirroring `@recoverai/core`'s `Metadata` — never a raw credential. */
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type RecoveryExecutionResult = z.infer<typeof recoveryExecutionResultSchema>;

/**
 * Independent verification of one `RecoveryExecutionResult` — never trusts
 * the execution result's own framing, only what's internally consistent
 * about it. Deterministic, no LLM involved (see deterministic-verification.ts).
 */
export const recoveryVerificationResultSchema = z.object({
  executionId: z.string().min(1),
  transactionId: z.string().min(1),
  verified: z.boolean(),
  /** Empty when `verified` is true; otherwise every specific consistency check that failed. */
  reasons: z.array(z.string()),
  checkedAt: z.string().min(1),
});
export type RecoveryVerificationResult = z.infer<typeof recoveryVerificationResultSchema>;
