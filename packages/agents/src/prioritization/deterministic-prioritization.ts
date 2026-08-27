import type { PrioritizationResult } from "./schema.js";
import type { PrioritizationInput } from "./types.js";

/** Same fixed, documented value anchor used elsewhere in this codebase (e.g. the diagnosis/recovery layers) for classifying transaction value — never re-derived from the dataset. ₹50,000. */
const HIGH_VALUE_ANCHOR_PAISE = 50_000_00;
/** ₹500 — below this, a transaction is flagged "low value" for prioritization purposes. */
const LOW_VALUE_ANCHOR_PAISE = 500_00;

const STRONG_RELIABILITY_THRESHOLD = 0.7;
const POOR_RELIABILITY_THRESHOLD = 0.3;
const HIGH_RECOVERABILITY_THRESHOLD = 60;
const LOW_RECOVERABILITY_THRESHOLD = 25;

/** Mirrors the recovery layer's own retry cap (Phase 5) as a local, documented constant — see docs/agent-architecture.md for why these aren't cross-imported between modules. */
const RETRY_CAP = 3;

function buildFactors(input: PrioritizationInput): readonly string[] {
  const factors: string[] = [];

  if (input.amount.amount >= HIGH_VALUE_ANCHOR_PAISE) {
    factors.push("transaction value is high");
  } else if (input.amount.amount < LOW_VALUE_ANCHOR_PAISE) {
    factors.push("transaction value is low");
  }

  if (input.recoverabilityScore >= HIGH_RECOVERABILITY_THRESHOLD) {
    factors.push("recoverability score is above threshold");
  } else if (input.recoverabilityScore < LOW_RECOVERABILITY_THRESHOLD) {
    factors.push("recoverability score is low");
  }

  if (input.customerHistory) {
    if (input.customerHistory.reliabilityScore >= STRONG_RELIABILITY_THRESHOLD) {
      factors.push("customer has a strong successful payment history");
    } else if (input.customerHistory.reliabilityScore < POOR_RELIABILITY_THRESHOLD) {
      factors.push("customer has a poor payment history");
    }
  } else {
    factors.push("no customer payment history is available");
  }

  if (!input.retryable) {
    factors.push("failure category is non-retryable");
  } else if (input.attemptCount < RETRY_CAP) {
    factors.push("retry opportunity remains");
  } else {
    factors.push("retry limit reached");
  }

  return factors.length > 0 ? factors : ["no distinguishing factors identified"];
}

/**
 * Deterministically packages the already-computed `riskScore`/
 * `recoverabilityScore`/`priority` (from `@recoverai/analysis`'s
 * `scoreTransaction()`) into an explainable, auditable
 * `PrioritizationResult`. Pure and side-effect free — same input always
 * produces the same output. Never recomputes the underlying score; only
 * explains it.
 */
export function prioritizeTransaction(input: PrioritizationInput): PrioritizationResult {
  const factors = buildFactors(input);
  const score = Math.round((input.riskScore + input.recoverabilityScore) / 2);

  return {
    transactionId: input.transactionId,
    priority: input.priority,
    score,
    factors: [...factors],
    explanation: `Priority: ${input.priority.toUpperCase()}. Factors: ${factors.join(", ")}.`,
  };
}
