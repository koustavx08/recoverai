import { brand } from "@recoverai/core";
import type {
  FailureReason,
  FailureReasonCode,
  FailureSeverity,
  ISODateString,
  Money,
  PaymentMethod,
  RecoveryStrategyType,
  RevenueRisk,
  RiskPriority,
} from "@recoverai/core";
import type { CustomerHistory } from "./customer-history.js";
import type { NormalizedTransaction } from "../types.js";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Transaction value (paise) at or above which the value factor saturates
 * to 1.0. A fixed, documented anchor rather than something derived from
 * the dataset, so scores stay comparable across ingestion runs of
 * different sizes. ₹50,000.
 */
export const HIGH_VALUE_ANCHOR_PAISE = 50_000_00;

/** Days after which a failure's recency factor decays fully to 0. */
export const RECENCY_DECAY_DAYS = 30;

/** riskScore = value*RISK_WEIGHTS.value + severity*RISK_WEIGHTS.severity + attempts*RISK_WEIGHTS.attempts, all in [0,1], result scaled to 0–100. */
export const RISK_WEIGHTS = { value: 0.45, severity: 0.35, attempts: 0.2 } as const;

/** recoverabilityScore weights when the failure category is retryable. */
export const RECOVERABILITY_WEIGHTS_RETRYABLE = {
  retryable: 0.4,
  customerReliability: 0.25,
  recency: 0.2,
  paymentMethod: 0.15,
} as const;

/** recoverabilityScore weights when the failure category is NOT retryable — a much lower ceiling, since no amount of customer reliability fixes an unretryable failure. */
export const RECOVERABILITY_WEIGHTS_NON_RETRYABLE = {
  customerReliability: 0.15,
  recency: 0.1,
} as const;

const SEVERITY_FACTOR: Readonly<Record<FailureSeverity, number>> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

/** How retry-friendly each payment method tends to be — a small, documented adjustment, not a dominant factor. */
const PAYMENT_METHOD_RETRY_FRIENDLINESS: Readonly<Record<PaymentMethod, number>> = {
  card: 0.9,
  upi: 0.8,
  netbanking: 0.7,
  wallet: 0.6,
  emi: 0.5,
  bank_transfer: 0.5,
  unknown: 0.3,
};

const STRATEGY_BY_FAILURE_CODE: Readonly<
  Record<FailureReasonCode, RecoveryStrategyType>
> = {
  issuer_decline: "retry_payment",
  insufficient_funds: "offer_installments",
  expired_card: "switch_payment_method",
  invalid_card: "switch_payment_method",
  invalid_payment_details: "switch_payment_method",
  upi_failure: "retry_payment",
  network_timeout: "retry_payment",
  processor_error: "retry_payment",
  risk_blocked: "no_action",
  customer_abandoned: "send_payment_link",
  authentication_failed: "switch_payment_method",
  duplicate_attempt: "no_action",
  unknown: "manual_followup",
};

/**
 * CRITICAL/HIGH/MEDIUM/LOW thresholds, evaluated per transaction (not
 * relative to the rest of the batch) so a single transaction's priority
 * doesn't change depending on what else was ingested alongside it.
 */
function computePriority(riskScore: number, recoverabilityScore: number): RiskPriority {
  if (riskScore >= 80 && recoverabilityScore >= 60) return "critical";
  if (riskScore >= 60 && recoverabilityScore >= 40) return "high";
  if (riskScore >= 35 || recoverabilityScore >= 25) return "medium";
  return "low";
}

function daysSince(iso: string, now: Date): number {
  const deltaMs = now.getTime() - Date.parse(iso);
  return Math.max(0, deltaMs / 86_400_000);
}

function buildExplanation(
  transaction: NormalizedTransaction,
  failureReason: FailureReason,
  riskScore: number,
  recoverabilityScore: number,
  customerHistory: CustomerHistory,
): string {
  const reliabilityPct = Math.round(customerHistory.reliabilityScore * 100);
  return (
    `${failureReason.description} ` +
    `Risk ${riskScore}/100, driven mainly by transaction value and ${failureReason.severity} failure severity ` +
    `(${transaction.attemptCount} attempt${transaction.attemptCount === 1 ? "" : "s"} so far). ` +
    `Recoverability ${recoverabilityScore}/100, reflecting that this failure type is ` +
    `${failureReason.recoverable ? "generally retryable" : "not straightforwardly retryable"}, ` +
    `${reliabilityPct}% historical customer reliability, and the recency of the last attempt.`
  );
}

export interface ScoreOptions {
  readonly now: Date;
}

/**
 * Scores a single failed/abandoned transaction into a `RevenueRisk`
 * (a.k.a. recovery candidate). Every input is explicit and the formula is
 * pure — same inputs always produce the same output.
 */
export function scoreTransaction(
  transaction: NormalizedTransaction,
  failureReason: FailureReason,
  customerHistory: CustomerHistory,
  options: ScoreOptions,
): RevenueRisk {
  const valueFactor = clamp01(transaction.amount.amount / HIGH_VALUE_ANCHOR_PAISE);
  const severityFactor = SEVERITY_FACTOR[failureReason.severity];
  const attemptFactor = clamp01((transaction.attemptCount - 1) / 3);

  const riskScore = Math.round(
    100 *
      clamp01(
        RISK_WEIGHTS.value * valueFactor +
          RISK_WEIGHTS.severity * severityFactor +
          RISK_WEIGHTS.attempts * attemptFactor,
      ),
  );

  const recencyFactor = clamp01(
    1 - daysSince(transaction.lastAttemptAt, options.now) / RECENCY_DECAY_DAYS,
  );
  const paymentMethodFactor =
    PAYMENT_METHOD_RETRY_FRIENDLINESS[transaction.paymentMethod];

  const recoverabilityScore = failureReason.recoverable
    ? Math.round(
        100 *
          clamp01(
            RECOVERABILITY_WEIGHTS_RETRYABLE.retryable * 1 +
              RECOVERABILITY_WEIGHTS_RETRYABLE.customerReliability *
                customerHistory.reliabilityScore +
              RECOVERABILITY_WEIGHTS_RETRYABLE.recency * recencyFactor +
              RECOVERABILITY_WEIGHTS_RETRYABLE.paymentMethod * paymentMethodFactor,
          ),
      )
    : Math.round(
        100 *
          clamp01(
            RECOVERABILITY_WEIGHTS_NON_RETRYABLE.customerReliability *
              customerHistory.reliabilityScore +
              RECOVERABILITY_WEIGHTS_NON_RETRYABLE.recency * recencyFactor,
          ),
      );

  // An estimate of what could be recovered — never a claim that it has been.
  const expectedRecoveryAmount: Money = {
    amount: Math.round(transaction.amount.amount * (recoverabilityScore / 100)),
    currency: transaction.amount.currency,
  };

  return {
    transactionId: transaction.id,
    riskScore,
    recoverabilityScore,
    expectedRecoveryAmount,
    failureReason,
    priority: computePriority(riskScore, recoverabilityScore),
    recommendedStrategy: STRATEGY_BY_FAILURE_CODE[failureReason.code],
    explanation: buildExplanation(
      transaction,
      failureReason,
      riskScore,
      recoverabilityScore,
      customerHistory,
    ),
    assessedAt: brand<string, "ISODateString">(
      options.now.toISOString(),
    ) as ISODateString,
  };
}
