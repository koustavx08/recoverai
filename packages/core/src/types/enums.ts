/** Lifecycle status of a transaction as observed by RecoverAI. */
export type TransactionStatus =
  "succeeded" | "failed" | "pending" | "refunded" | "abandoned";

/** Payment method/instrument used for a transaction attempt. */
export type PaymentMethod =
  "card" | "upi" | "netbanking" | "wallet" | "emi" | "bank_transfer" | "unknown";

/** Status of an individual attempt to charge a payment instrument. */
export type PaymentAttemptStatus = "succeeded" | "failed" | "pending";

/**
 * Normalized taxonomy of reasons a payment attempt failed. Vendor-specific
 * decline/error codes must be mapped to this set at the integration
 * boundary — the domain layer never sees provider-specific codes directly.
 */
export type FailureReasonCode =
  | "issuer_decline"
  | "insufficient_funds"
  | "expired_card"
  | "invalid_card"
  | "invalid_payment_details"
  | "upi_failure"
  | "network_timeout"
  | "processor_error"
  | "risk_blocked"
  | "customer_abandoned"
  | "authentication_failed"
  | "duplicate_attempt"
  | "unknown";

/** Priority tier assigned to a revenue-risk assessment. */
export type RiskPriority = "critical" | "high" | "medium" | "low";

/**
 * Qualitative severity of a payment failure, independent of the
 * transaction's monetary value — how bad the failure itself is, not how
 * much money is attached to it.
 */
export type FailureSeverity = "low" | "medium" | "high" | "critical";

/** Category of strategy the system can recommend to recover lost revenue. */
export type RecoveryStrategyType =
  | "retry_payment"
  | "send_payment_link"
  | "switch_payment_method"
  | "offer_installments"
  | "manual_followup"
  | "no_action";

/** Concrete, executable action derived from a recovery strategy. */
export type RecoveryActionType =
  | "auto_retry"
  | "notification_email"
  | "notification_sms"
  | "notification_whatsapp"
  | "payment_link"
  | "escalate_to_agent"
  | "none";

/** Lifecycle status of a recovery action as it is executed and verified. */
export type RecoveryActionStatus =
  "pending" | "in_progress" | "succeeded" | "failed" | "skipped" | "cancelled";

/** The stage of the agent pipeline that produced an AgentDecision. */
export type AgentDecisionStage =
  | "detection"
  | "diagnosis"
  | "prioritization"
  | "strategy_selection"
  | "recovery_execution"
  | "verification";

/** Category of event recorded in the immutable audit trail. */
export type AuditEventType =
  | "transaction_ingested"
  | "risk_assessed"
  | "strategy_selected"
  | "recovery_action_executed"
  | "recovery_verified"
  | "agent_decision_recorded"
  | "system_error";

/** Actor that initiated an auditable event. */
export type ActorType = "system" | "agent" | "user" | "webhook";
