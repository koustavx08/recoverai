import { describe, expect, it } from "vitest";
import type { RecoveryActionType, RecoveryStrategyType } from "@recoverai/core";
import { mapStrategyToAction, STRATEGY_TO_ACTION } from "./action-mapping.js";

const ALL_STRATEGIES: readonly RecoveryStrategyType[] = [
  "retry_payment",
  "send_payment_link",
  "switch_payment_method",
  "offer_installments",
  "manual_followup",
  "wait_and_retry",
  "manual_review",
  "no_action",
];

const VALID_ACTIONS: readonly RecoveryActionType[] = [
  "auto_retry",
  "notification_email",
  "notification_sms",
  "notification_whatsapp",
  "payment_link",
  "escalate_to_agent",
  "none",
];

describe("STRATEGY_TO_ACTION", () => {
  it("maps every strategy to a valid, bounded action", () => {
    for (const strategy of ALL_STRATEGIES) {
      expect(VALID_ACTIONS).toContain(STRATEGY_TO_ACTION[strategy]);
    }
  });

  it("maps manual_review to escalate_to_agent", () => {
    expect(mapStrategyToAction("manual_review")).toBe("escalate_to_agent");
  });

  it("maps no_action to none", () => {
    expect(mapStrategyToAction("no_action")).toBe("none");
  });

  it("maps every retry-family strategy to auto_retry", () => {
    expect(mapStrategyToAction("retry_payment")).toBe("auto_retry");
    expect(mapStrategyToAction("wait_and_retry")).toBe("auto_retry");
    expect(mapStrategyToAction("switch_payment_method")).toBe("auto_retry");
  });

  it("maps send_payment_link to payment_link", () => {
    expect(mapStrategyToAction("send_payment_link")).toBe("payment_link");
  });

  it("is a pure, deterministic function", () => {
    for (const strategy of ALL_STRATEGIES) {
      expect(mapStrategyToAction(strategy)).toBe(mapStrategyToAction(strategy));
    }
  });
});
