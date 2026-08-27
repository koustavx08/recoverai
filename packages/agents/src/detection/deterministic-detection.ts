import type { DetectionResult, DetectionSeverity } from "./schema.js";
import type { DetectionInput } from "./types.js";

/** Attempts at or above this cap are treated as "already exhausted normal retry headroom" — mirrors the recovery layer's own retry cap (Phase 5), duplicated as a small, local, documented constant rather than a cross-module import, matching this codebase's established pattern for such thresholds. */
export const DETECTION_RETRY_CAP = 3;

/** Transaction value (paise) tiers used only to grade *how severe* a detection finding is — not a re-derivation of risk scoring, just a cheap, local anchor for display/prioritization triage before the real deterministic risk score exists. */
const CRITICAL_VALUE_ANCHOR_PAISE = 50_000_00;
const HIGH_VALUE_ANCHOR_PAISE = 20_000_00;
const MEDIUM_VALUE_ANCHOR_PAISE = 2_000_00;

function severityFromAmount(amountPaise: number): DetectionSeverity {
  if (amountPaise >= CRITICAL_VALUE_ANCHOR_PAISE) return "critical";
  if (amountPaise >= HIGH_VALUE_ANCHOR_PAISE) return "high";
  if (amountPaise >= MEDIUM_VALUE_ANCHOR_PAISE) return "medium";
  return "low";
}

/**
 * Deterministically decides whether a transaction represents a revenue-risk
 * event (`detected`) and, if so, whether the rest of the pipeline should
 * pursue it now (`actionable`). Pure and side-effect free — no model call,
 * ever. This is the cheap gate that runs before the more expensive
 * Diagnosis/Strategy/Recovery stages.
 */
export function detectRevenueRisk(input: DetectionInput): DetectionResult {
  const metadata = { attemptCount: input.attemptCount, amount: input.amount.amount };

  if (input.status === "succeeded") {
    return {
      transactionId: input.transactionId,
      detected: false,
      actionable: false,
      reason: "Transaction succeeded — no revenue at risk.",
      severity: "none",
      metadata,
    };
  }

  if (input.status === "pending") {
    return {
      transactionId: input.transactionId,
      detected: false,
      actionable: false,
      reason: "Transaction is still pending — not yet actionable.",
      severity: "none",
      metadata,
    };
  }

  if (input.status === "refunded") {
    return {
      transactionId: input.transactionId,
      detected: true,
      actionable: false,
      reason: "Transaction was refunded — not a recovery candidate.",
      severity: "low",
      metadata,
    };
  }

  // status is "failed" or "abandoned" from here — a genuine revenue-risk event.
  const severity = severityFromAmount(input.amount.amount);

  if (input.retryable === false) {
    return {
      transactionId: input.transactionId,
      detected: true,
      actionable: false,
      reason: "Failure category is non-retryable — flagged for manual handling, not automatic recovery.",
      severity,
      metadata: { ...metadata, retryable: false },
    };
  }

  if (input.attemptCount >= DETECTION_RETRY_CAP) {
    return {
      transactionId: input.transactionId,
      detected: true,
      actionable: false,
      reason: `Retry limit already reached (${input.attemptCount} attempts, cap ${DETECTION_RETRY_CAP}) — requires manual handling.`,
      severity,
      metadata,
    };
  }

  return {
    transactionId: input.transactionId,
    detected: true,
    actionable: true,
    reason: "Failed/abandoned transaction with retry headroom remaining — eligible for recovery.",
    severity,
    metadata,
  };
}
