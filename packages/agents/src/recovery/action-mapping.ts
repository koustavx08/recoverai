import type { RecoveryActionType, RecoveryStrategyType } from "@recoverai/core";

/**
 * Deterministic, exhaustive strategy -> action mapping. Strategy != Action:
 * a `StrategyDecision` is a *decision* ("switch payment method"); a
 * `RecoveryActionType` is the bounded, already-existing implementation kind
 * (`@recoverai/core`) that decision is carried out through. This mapping is
 * the only place that translation happens — nothing else, including an
 * LLM, ever picks an action directly. `Record<RecoveryStrategyType, ...>`
 * forces this to stay exhaustive as the strategy enum grows.
 */
export const STRATEGY_TO_ACTION: Readonly<Record<RecoveryStrategyType, RecoveryActionType>> = {
  retry_payment: "auto_retry",
  wait_and_retry: "auto_retry",
  switch_payment_method: "auto_retry",
  send_payment_link: "payment_link",
  manual_followup: "notification_email",
  offer_installments: "notification_email",
  manual_review: "escalate_to_agent",
  no_action: "none",
};

export function mapStrategyToAction(strategy: RecoveryStrategyType): RecoveryActionType {
  return STRATEGY_TO_ACTION[strategy];
}
