import type { FailureReasonCode } from "@recoverai/core";
import {
  type Diagnosis,
  type DiagnosisCategory,
  type EvidenceItem,
  type InterventionType,
  type RecoverabilityAssessment,
  type RetryRecommendation,
} from "./schema.js";
import type { DiagnosisFacts, DiagnosisInput } from "./types.js";

/**
 * Bumped whenever the deterministic rules or the LLM prompt/schema change in
 * a way that would materially change output — stored on every `Diagnosis`
 * for audit-trail reproducibility.
 */
export const DIAGNOSIS_AGENT_VERSION = "diagnosis-agent@1";

/** Deterministic mapping from the technical failure code to a diagnosis category, used only when nothing more specific (non-retryable, repeated failure, insufficient evidence) applies first. */
const CATEGORY_BY_FAILURE_CODE: Readonly<Record<FailureReasonCode, DiagnosisCategory>> = {
  issuer_decline: "issuer_decline",
  insufficient_funds: "insufficient_funds",
  expired_card: "expired_card",
  invalid_card: "unknown",
  invalid_payment_details: "unknown",
  upi_failure: "upi_failure",
  network_timeout: "network_timeout",
  processor_error: "unknown",
  risk_blocked: "non_retryable",
  customer_abandoned: "checkout_abandonment",
  authentication_failed: "unknown",
  duplicate_attempt: "non_retryable",
  unknown: "unknown",
};

/**
 * Determines the diagnosis category by fixed precedence: insufficient
 * evidence, then refund-related, then non-retryable, then a repeated-failure
 * pattern, and only then the technical failure code mapping. This ordering
 * is deliberate and documented so it stays deterministic and testable.
 */
function determineCategory(input: DiagnosisInput, facts: DiagnosisFacts): DiagnosisCategory {
  if (!facts.evidenceSufficient) return "insufficient_evidence";
  if (facts.isRefundRelated) return "refund_related";
  if (!input.retryable) return "non_retryable";
  if (facts.isRepeatedFailure) return "repeated_failure";
  return CATEGORY_BY_FAILURE_CODE[input.failureCode];
}

function determineRecoverability(
  input: DiagnosisInput,
  facts: DiagnosisFacts,
  category: DiagnosisCategory,
): RecoverabilityAssessment {
  if (category === "insufficient_evidence") return "INSUFFICIENT_EVIDENCE";
  if (category === "non_retryable") return "LOW_RECOVERABILITY";

  if (input.recoverabilityScore !== undefined) {
    if (input.recoverabilityScore >= 60) return "LIKELY_RECOVERABLE";
    if (input.recoverabilityScore >= 30) return "POSSIBLY_RECOVERABLE";
    return "LOW_RECOVERABILITY";
  }

  if (facts.hasCustomerHistory && input.customerHistory && input.customerHistory.reliabilityScore >= 0.6) {
    return "LIKELY_RECOVERABLE";
  }
  return "POSSIBLY_RECOVERABLE";
}

function determineInterventions(category: DiagnosisCategory): readonly InterventionType[] {
  switch (category) {
    case "insufficient_evidence":
      return ["HUMAN_REVIEW"];
    case "non_retryable":
      return ["CUSTOMER_NOTIFICATION", "HUMAN_REVIEW", "NO_ACTION"];
    case "repeated_failure":
      return ["ALTERNATE_PAYMENT_METHOD", "RECOVERY_LINK", "HUMAN_REVIEW"];
    case "upi_failure":
    case "network_timeout":
      return ["RETRY", "WAIT_AND_RETRY", "RECOVERY_LINK"];
    case "issuer_decline":
    case "insufficient_funds":
      return ["ALTERNATE_PAYMENT_METHOD", "RECOVERY_LINK", "CUSTOMER_NOTIFICATION"];
    case "expired_card":
      return ["ALTERNATE_PAYMENT_METHOD", "RECOVERY_LINK"];
    case "checkout_abandonment":
      return ["CUSTOMER_NOTIFICATION", "RECOVERY_LINK"];
    case "refund_related":
      return ["HUMAN_REVIEW", "NO_ACTION"];
    default:
      return ["HUMAN_REVIEW"];
  }
}

const RETRYABLE_CATEGORIES: ReadonlySet<DiagnosisCategory> = new Set([
  "issuer_decline",
  "insufficient_funds",
  "upi_failure",
  "network_timeout",
  "expired_card",
  "repeated_failure",
  "checkout_abandonment",
  "unknown",
]);

/** Attempts beyond this cap are never recommended, regardless of category. */
const MAX_RECOMMENDED_ATTEMPTS = 3;

function determineRetryRecommendation(
  input: DiagnosisInput,
  category: DiagnosisCategory,
): RetryRecommendation {
  const eligible = input.retryable && RETRYABLE_CATEGORIES.has(category);
  if (!eligible) {
    return {
      recommended: false,
      maxAttempts: 0,
      reasoning:
        "Deterministic rules mark this failure category as not eligible for further retries.",
    };
  }

  const remaining = Math.max(0, MAX_RECOMMENDED_ATTEMPTS - input.attemptCount);
  return {
    recommended: remaining > 0,
    maxAttempts: remaining,
    reasoning:
      remaining > 0
        ? "Failure category is retryable and the attempt count has not yet reached the recommended cap."
        : "Failure category is retryable, but the attempt count has already reached the recommended cap.",
  };
}

function determineConfidence(facts: DiagnosisFacts): number {
  if (!facts.evidenceSufficient) return 0.2;
  return facts.hasCustomerHistory ? 0.6 : 0.45;
}

function buildLimitations(input: DiagnosisInput, facts: DiagnosisFacts): readonly string[] {
  const limitations: string[] = [];
  if (!facts.hasCustomerHistory) {
    limitations.push("No customer payment history was available for this customer.");
  }
  if (input.riskScore === undefined || input.recoverabilityScore === undefined) {
    limitations.push("Deterministic risk/recoverability scores were not supplied.");
  }
  limitations.push(
    "This diagnosis was produced by deterministic rules only, without AI-assisted reasoning.",
  );
  return limitations;
}

function buildExplanation(
  input: DiagnosisInput,
  facts: DiagnosisFacts,
  category: DiagnosisCategory,
): string {
  return (
    `${input.failureDescription} ` +
    `Classified as "${category}" based on ${input.attemptCount} recorded attempt(s) ` +
    `(${facts.isRepeatedFailure ? "a repeated failure pattern" : "not yet a repeated pattern"}), ` +
    `a ${input.retryable ? "retryable" : "non-retryable"} failure category, and ` +
    `${facts.hasCustomerHistory ? `customer reliability score ${input.customerHistory?.reliabilityScore.toFixed(2)}` : "no available customer history"}.`
  );
}

export interface DeterministicDiagnosisOptions {
  readonly now?: Date;
  /** Set when this fallback ran because the LLM path was skipped or rejected — never set for a plain "no AI configured" run vs. an actual failure without a reason is still allowed, but callers should always pass one for a real audit trail. */
  readonly fallbackReason?: string;
}

/**
 * Produces a fully valid, bounded `Diagnosis` using only deterministic
 * rules over `DiagnosisFacts` and the evidence bundle — no model call
 * involved. This is what backs `recoverai analyze`-style usage without an
 * API key, and what every LLM path falls back to on any failure (provider
 * error, invalid output, failed evidence-grounding validation). It never
 * claims to be an LLM result: `metadata.mode` is always `"deterministic"`.
 */
export function buildDeterministicDiagnosis(
  input: DiagnosisInput,
  facts: DiagnosisFacts,
  evidence: readonly EvidenceItem[],
  options: DeterministicDiagnosisOptions = {},
): Diagnosis {
  const category = determineCategory(input, facts);
  const recoverabilityAssessment = determineRecoverability(input, facts, category);
  const interventionEligibility = determineInterventions(category);
  const retryRecommendation = determineRetryRecommendation(input, category);
  const confidence = determineConfidence(facts);
  const now = options.now ?? new Date();

  return {
    transactionId: input.transactionId,
    category,
    confidence,
    evidence: [...evidence],
    recoverabilityAssessment,
    retryRecommendation,
    interventionEligibility: [...interventionEligibility],
    explanation: buildExplanation(input, facts, category),
    limitations: [...buildLimitations(input, facts)],
    metadata: {
      mode: "deterministic",
      provider: null,
      model: null,
      agentVersion: DIAGNOSIS_AGENT_VERSION,
      generatedAt: now.toISOString(),
      fallbackUsed: options.fallbackReason !== undefined,
      fallbackReason: options.fallbackReason,
    },
  };
}
