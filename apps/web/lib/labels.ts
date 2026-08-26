import type { FailureReasonCode, RiskPriority } from "@recoverai/core";

export const FAILURE_LABELS: Readonly<Record<FailureReasonCode, string>> = {
  issuer_decline: "Issuer decline",
  insufficient_funds: "Insufficient funds",
  expired_card: "Expired card",
  invalid_card: "Invalid card",
  invalid_payment_details: "Invalid payment details",
  upi_failure: "UPI failure",
  network_timeout: "Timeout",
  processor_error: "Processor error",
  risk_blocked: "Risk blocked",
  customer_abandoned: "Abandonment",
  authentication_failed: "Authentication failed",
  duplicate_attempt: "Duplicate attempt",
  unknown: "Unknown",
};

export const PRIORITY_BADGE_VARIANT: Readonly<
  Record<RiskPriority, "danger" | "warning" | "accent" | "neutral">
> = {
  critical: "danger",
  high: "warning",
  medium: "accent",
  low: "neutral",
};
