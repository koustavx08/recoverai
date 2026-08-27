import type { LlmDiagnosisResponse } from "./schema.js";
import type { DiagnosisInput } from "./types.js";

export interface ValidationResult {
  readonly ok: boolean;
  /** Present only when `ok` is false — the specific reason validation failed, for audit logging. */
  readonly reason?: string;
}

/**
 * Validates an LLM structured response beyond what Zod already checked
 * (bounded category/intervention/recoverability enums, confidence bounds,
 * and required fields are enforced by `llmDiagnosisResponseSchema` itself
 * inside `AIModelProvider.generateStructured` — a response that fails those
 * throws before it ever reaches here). This function checks the things Zod
 * cannot: whether the response is actually *grounded* in the evidence it
 * was given, and whether it respects the deterministic safety boundary.
 *
 * On failure the caller must discard the response entirely and fall back
 * deterministically — never silently repair or partially trust it.
 */
export function validateLlmDiagnosisResponse(
  data: LlmDiagnosisResponse,
  input: DiagnosisInput,
  knownEvidenceIds: ReadonlySet<string>,
): ValidationResult {
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

  if (!input.retryable) {
    if (data.interventionEligibility.includes("RETRY")) {
      return {
        ok: false,
        reason: "response recommended RETRY for a failure category marked non-retryable",
      };
    }
    if (data.retryRecommendation.recommended) {
      return {
        ok: false,
        reason: "response recommended a retry for a failure category marked non-retryable",
      };
    }
  }

  return { ok: true };
}
