import type { FailureReason, FailureReasonCode, FailureSeverity } from "@recoverai/core";
import type { NormalizedTransaction } from "../types.js";

/**
 * Deterministic failure classification rules.
 *
 * `confidence` here is a *rule-based* certainty score (0–1), not a model's
 * self-reported confidence: it reflects how directly the evidence maps to
 * the category (a corroborated, explicit signal scores high; falling back
 * to "no signal at all" scores low). The exact numbers below are
 * documented, fixed constants — never randomized, never learned.
 *
 * `severity` is how bad the failure category itself is, independent of
 * transaction value (value is folded into risk scoring separately — see
 * risk/risk-scorer.ts).
 *
 * `recoverable` means "some follow-up action is plausible" — not
 * necessarily an identical retry (e.g. an expired card needs the customer
 * to provide a new one, not a blind retry).
 */
interface CategoryProfile {
  readonly description: string;
  readonly severity: FailureSeverity;
  readonly recoverable: boolean;
  readonly confidence: number;
}

const CATEGORY_PROFILES: Readonly<Record<FailureReasonCode, CategoryProfile>> = {
  issuer_decline: {
    description: "The card issuer declined the transaction.",
    severity: "medium",
    recoverable: true,
    confidence: 0.95,
  },
  insufficient_funds: {
    description: "The payment method had insufficient available balance.",
    severity: "medium",
    recoverable: true,
    confidence: 0.95,
  },
  expired_card: {
    description: "The card had expired at the time of the attempt.",
    severity: "medium",
    recoverable: true,
    confidence: 0.97,
  },
  invalid_card: {
    description: "The card details provided were invalid.",
    severity: "high",
    recoverable: true,
    confidence: 0.9,
  },
  invalid_payment_details: {
    description: "The payment details provided did not pass basic validation.",
    severity: "high",
    recoverable: true,
    confidence: 0.9,
  },
  upi_failure: {
    description: "The UPI collect request failed or expired before approval.",
    severity: "medium",
    recoverable: true,
    confidence: 0.93,
  },
  network_timeout: {
    description: "Payment attempt timed out before confirmation.",
    severity: "medium",
    recoverable: true,
    confidence: 0.96,
  },
  processor_error: {
    description: "The payment processor returned an unexpected error.",
    severity: "medium",
    recoverable: true,
    confidence: 0.85,
  },
  risk_blocked: {
    description: "The transaction was blocked by risk/fraud controls.",
    severity: "critical",
    recoverable: false,
    confidence: 0.92,
  },
  customer_abandoned: {
    description: "Customer left checkout without completing a payment attempt.",
    severity: "low",
    recoverable: true,
    confidence: 0.99,
  },
  authentication_failed: {
    description: "3-D Secure or another authentication step was not completed.",
    severity: "high",
    recoverable: true,
    confidence: 0.88,
  },
  duplicate_attempt: {
    description:
      "Multiple attempts were made in immediate succession, consistent with a duplicate submission rather than a distinct failure.",
    severity: "low",
    recoverable: false,
    confidence: 0.9,
  },
  unknown: {
    description: "No specific failure signal was available to classify this transaction.",
    severity: "medium",
    recoverable: true,
    confidence: 0.5,
  },
};

/** Attempts within this many milliseconds of each other, on the same method, are treated as one duplicated submission rather than distinct failures. */
const DUPLICATE_ATTEMPT_WINDOW_MS = 60_000;

function detectDuplicateAttempt(transaction: NormalizedTransaction): boolean {
  const attempts = [...transaction.attempts].sort((a, b) =>
    a.attemptedAt < b.attemptedAt ? -1 : 1,
  );
  for (let i = 1; i < attempts.length; i++) {
    const prev = attempts[i - 1]!;
    const current = attempts[i]!;
    if (prev.paymentMethod !== current.paymentMethod) continue;
    const deltaMs = Date.parse(current.attemptedAt) - Date.parse(prev.attemptedAt);
    if (deltaMs >= 0 && deltaMs <= DUPLICATE_ATTEMPT_WINDOW_MS) return true;
  }
  return false;
}

function buildEvidence(
  transaction: NormalizedTransaction,
  code: FailureReasonCode,
): readonly string[] {
  const evidence: string[] = [];

  if (code === "customer_abandoned") {
    evidence.push("no payment attempts recorded");
    return evidence;
  }

  if (code === "duplicate_attempt") {
    evidence.push(
      `${transaction.attemptCount} attempts recorded within ${DUPLICATE_ATTEMPT_WINDOW_MS / 1000}s of each other`,
    );
    evidence.push(`same payment method (${transaction.paymentMethod}) across attempts`);
    return evidence;
  }

  if (transaction.failureReasonCode === code) {
    evidence.push(`"${code}" signal from the most recent payment attempt`);
  } else {
    evidence.push("no direct failure-reason signal in the source data");
  }

  evidence.push(
    transaction.attemptCount <= 1
      ? "single failed attempt"
      : `${transaction.attemptCount} failed attempts recorded`,
  );

  if (code !== "issuer_decline") evidence.push("no issuer decline recorded");

  return evidence;
}

/**
 * Classifies why a failed/abandoned transaction failed, using only
 * deterministic rules over the transaction's own recorded data. Evaluated
 * in order: abandonment (no attempts) -> duplicate-submission pattern ->
 * the source data's own failure-reason signal -> unknown (no signal).
 */
export function classifyFailure(transaction: NormalizedTransaction): FailureReason {
  let code: FailureReasonCode;

  if (transaction.attemptCount === 0) {
    code = "customer_abandoned";
  } else if (detectDuplicateAttempt(transaction)) {
    code = "duplicate_attempt";
  } else if (
    transaction.failureReasonCode &&
    transaction.failureReasonCode in CATEGORY_PROFILES
  ) {
    code = transaction.failureReasonCode;
  } else {
    code = "unknown";
  }

  const profile = CATEGORY_PROFILES[code];

  return {
    code,
    description: profile.description,
    recoverable: profile.recoverable,
    severity: profile.severity,
    confidence: profile.confidence,
    evidence: buildEvidence(transaction, code),
  };
}
