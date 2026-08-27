import type { FailureReasonCode } from "@recoverai/core";
import type { DiagnosisFacts, DiagnosisInput, TransactionValueClass } from "./types.js";

/**
 * Transaction value (paise) at or above which a transaction is classified
 * "high" value. Deliberately duplicated as a small, fixed, documented
 * constant here rather than imported from `@recoverai/analysis`'s
 * `HIGH_VALUE_ANCHOR_PAISE` — `packages/agents` must not depend on
 * `@recoverai/analysis` (see docs/agent-architecture.md). ₹50,000.
 */
export const HIGH_VALUE_ANCHOR_PAISE = 50_000_00;

/** ₹5,000 — the floor for "medium" value; below this a transaction is "low" value. */
export const MEDIUM_VALUE_ANCHOR_PAISE = 5_000_00;

/** Attempt count at or above which a failure pattern counts as "repeated". */
export const REPEATED_FAILURE_ATTEMPT_THRESHOLD = 3;

/**
 * Failure codes that, on their own, don't carry enough signal to support a
 * confident diagnosis — they need corroborating customer history or a
 * deterministic risk score before evidence counts as sufficient. Every
 * other code (issuer_decline, insufficient_funds, upi_failure,
 * network_timeout, expired_card, customer_abandoned, risk_blocked,
 * authentication_failed, duplicate_attempt) is itself a high-confidence
 * classification from `@recoverai/analysis`'s failure classifier — it does
 * not need extra corroboration to be "sufficient evidence," even when
 * attemptCount is 0 (customer_abandoned is defined by 0 attempts, and is
 * not itself a sign of thin evidence).
 */
const WEAK_SIGNAL_FAILURE_CODES: ReadonlySet<FailureReasonCode> = new Set([
  "unknown",
  "processor_error",
  "invalid_card",
  "invalid_payment_details",
]);

function classifyValue(amountPaise: number): TransactionValueClass {
  if (amountPaise >= HIGH_VALUE_ANCHOR_PAISE) return "high";
  if (amountPaise >= MEDIUM_VALUE_ANCHOR_PAISE) return "medium";
  return "low";
}

/**
 * Deterministically derives every fact the Diagnosis Agent is allowed to
 * reason over, straight from `DiagnosisInput`. Pure and side-effect free —
 * same input always produces the same facts, and nothing here is inferred
 * from anything other than the fields actually present on `input`.
 */
export function buildDiagnosisFacts(input: DiagnosisInput): DiagnosisFacts {
  const hasCustomerHistory =
    input.customerHistory !== undefined && input.customerHistory.totalTransactions > 1;

  const previousSuccessfulPayments = input.customerHistory?.successfulTransactions ?? 0;
  const previousFailedPayments = input.customerHistory
    ? Math.max(
        0,
        input.customerHistory.totalTransactions - input.customerHistory.successfulTransactions,
      )
    : 0;

  // A weak/generic failure code needs corroboration (customer history or a
  // deterministic risk score) to count as "sufficient evidence"; a strong,
  // specific code is sufficient on its own.
  const evidenceSufficient =
    !WEAK_SIGNAL_FAILURE_CODES.has(input.failureCode) ||
    hasCustomerHistory ||
    input.riskScore !== undefined;

  return {
    valueClass: classifyValue(input.amount.amount),
    isRepeatedFailure: input.attemptCount >= REPEATED_FAILURE_ATTEMPT_THRESHOLD,
    isNonRetryable: !input.retryable,
    isTimeout: input.failureCode === "network_timeout",
    isUpiFailure: input.failureCode === "upi_failure" || input.paymentMethod === "upi",
    isIssuerDecline: input.failureCode === "issuer_decline",
    isInsufficientFunds: input.failureCode === "insufficient_funds",
    isCheckoutAbandonment: input.failureCode === "customer_abandoned",
    isRefundRelated: input.transactionStatus === "refunded",
    hasCustomerHistory,
    previousSuccessfulPayments,
    previousFailedPayments,
    evidenceSufficient,
  };
}
