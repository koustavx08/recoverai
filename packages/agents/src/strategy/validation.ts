import type { RecoveryStrategyType } from "@recoverai/core";
import type { LlmStrategyResponse } from "./schema.js";
import type { StrategyInput } from "./types.js";

export interface StrategyValidationResult {
  readonly ok: boolean;
  /** Present only when `ok` is false — the specific reason validation failed, for audit logging. */
  readonly reason?: string;
}

/**
 * Validates an LLM structured response beyond what Zod already checked
 * (bounded strategy enum, confidence bounds, and required fields are
 * enforced by `llmStrategyResponseSchema` inside `AIModelProvider.
 * generateStructured` — a response that fails those throws before it ever
 * reaches here). This function checks the things Zod cannot: whether the
 * response is grounded in the evidence it was given, and whether the
 * chosen strategy is actually policy-approved for *this* transaction (not
 * just a member of the bounded enum in general).
 *
 * On failure the caller must discard the response entirely and fall back
 * deterministically — never silently repair or partially trust it.
 */
export function validateLlmStrategyResponse(
  data: LlmStrategyResponse,
  input: StrategyInput,
  knownEvidenceIds: ReadonlySet<string>,
  allowedStrategies: readonly RecoveryStrategyType[],
): StrategyValidationResult {
  if (data.transactionId !== input.transactionId) {
    return {
      ok: false,
      reason: `response transactionId "${data.transactionId}" does not match the requested transaction "${input.transactionId}"`,
    };
  }

  const unknownIds = data.evidenceIds.filter((id) => !knownEvidenceIds.has(id));
  if (unknownIds.length > 0) {
    return {
      ok: false,
      reason: `response cited unknown evidence id(s): ${unknownIds.join(", ")}`,
    };
  }

  if (!allowedStrategies.includes(data.strategy)) {
    return {
      ok: false,
      reason: `strategy "${data.strategy}" is not policy-approved for this transaction (allowed: ${allowedStrategies.join(", ")})`,
    };
  }

  return { ok: true };
}
