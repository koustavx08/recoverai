import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { buildDiagnosisFacts, HIGH_VALUE_ANCHOR_PAISE } from "./facts.js";
import type { DiagnosisInput } from "./types.js";

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    transactionId: brand("txn_test"),
    amount: { amount: 10_000, currency: "INR" },
    paymentMethod: "card",
    transactionStatus: "failed",
    attemptCount: 1,
    failureCode: "issuer_decline",
    failureDescription: "The card issuer declined the transaction.",
    retryable: true,
    customerHistory: { totalTransactions: 4, successfulTransactions: 3, reliabilityScore: 0.75 },
    riskScore: 50,
    recoverabilityScore: 60,
    ...overrides,
  };
}

describe("buildDiagnosisFacts", () => {
  it("detects an issuer decline", () => {
    const facts = buildDiagnosisFacts(input({ failureCode: "issuer_decline" }));
    expect(facts.isIssuerDecline).toBe(true);
    expect(facts.isInsufficientFunds).toBe(false);
  });

  it("detects insufficient funds", () => {
    const facts = buildDiagnosisFacts(input({ failureCode: "insufficient_funds" }));
    expect(facts.isInsufficientFunds).toBe(true);
  });

  it("detects a UPI failure by failure code", () => {
    const facts = buildDiagnosisFacts(
      input({ failureCode: "upi_failure", paymentMethod: "upi" }),
    );
    expect(facts.isUpiFailure).toBe(true);
  });

  it("detects a UPI failure by payment method alone", () => {
    const facts = buildDiagnosisFacts(
      input({ failureCode: "unknown", paymentMethod: "upi" }),
    );
    expect(facts.isUpiFailure).toBe(true);
  });

  it("detects a network timeout", () => {
    const facts = buildDiagnosisFacts(input({ failureCode: "network_timeout" }));
    expect(facts.isTimeout).toBe(true);
  });

  it("detects a repeated failure pattern at the attempt threshold", () => {
    const below = buildDiagnosisFacts(input({ attemptCount: 2 }));
    const at = buildDiagnosisFacts(input({ attemptCount: 3 }));
    expect(below.isRepeatedFailure).toBe(false);
    expect(at.isRepeatedFailure).toBe(true);
  });

  it("marks a non-retryable failure", () => {
    const facts = buildDiagnosisFacts(input({ retryable: false }));
    expect(facts.isNonRetryable).toBe(true);
  });

  it("recognizes a checkout abandonment", () => {
    const facts = buildDiagnosisFacts(
      input({ failureCode: "customer_abandoned", attemptCount: 0 }),
    );
    expect(facts.isCheckoutAbandonment).toBe(true);
  });

  it("recognizes a refund-related transaction by status", () => {
    const facts = buildDiagnosisFacts(input({ transactionStatus: "refunded" }));
    expect(facts.isRefundRelated).toBe(true);
  });

  it("reflects a reliable customer history", () => {
    const facts = buildDiagnosisFacts(
      input({
        customerHistory: { totalTransactions: 5, successfulTransactions: 5, reliabilityScore: 1 },
      }),
    );
    expect(facts.hasCustomerHistory).toBe(true);
    expect(facts.previousSuccessfulPayments).toBe(5);
    expect(facts.previousFailedPayments).toBe(0);
  });

  it("reflects a poor customer history", () => {
    const facts = buildDiagnosisFacts(
      input({
        customerHistory: { totalTransactions: 5, successfulTransactions: 0, reliabilityScore: 0 },
      }),
    );
    expect(facts.previousFailedPayments).toBe(5);
  });

  it("flags insufficient evidence for a weak/generic failure code with no corroborating history or risk score", () => {
    const facts = buildDiagnosisFacts(
      input({
        failureCode: "unknown",
        customerHistory: undefined,
        riskScore: undefined,
        recoverabilityScore: undefined,
      }),
    );
    expect(facts.evidenceSufficient).toBe(false);
  });

  it("does not flag insufficient evidence for a weak failure code when a risk score is present", () => {
    const facts = buildDiagnosisFacts(
      input({ failureCode: "unknown", customerHistory: undefined, riskScore: 40 }),
    );
    expect(facts.evidenceSufficient).toBe(true);
  });

  it("treats a specific, high-confidence failure code as sufficient evidence even with 0 attempts and no history (checkout abandonment)", () => {
    const facts = buildDiagnosisFacts(
      input({
        failureCode: "customer_abandoned",
        attemptCount: 0,
        customerHistory: undefined,
        riskScore: undefined,
        recoverabilityScore: undefined,
      }),
    );
    expect(facts.evidenceSufficient).toBe(true);
    expect(facts.isCheckoutAbandonment).toBe(true);
  });

  it("classifies transaction value against the fixed anchors", () => {
    const low = buildDiagnosisFacts(input({ amount: { amount: 1_000, currency: "INR" } }));
    const medium = buildDiagnosisFacts(input({ amount: { amount: 6_000_00, currency: "INR" } }));
    const high = buildDiagnosisFacts(
      input({ amount: { amount: HIGH_VALUE_ANCHOR_PAISE, currency: "INR" } }),
    );
    expect(low.valueClass).toBe("low");
    expect(medium.valueClass).toBe("medium");
    expect(high.valueClass).toBe("high");
  });

  it("is deterministic given identical input", () => {
    const a = buildDiagnosisFacts(input({}));
    const b = buildDiagnosisFacts(input({}));
    expect(a).toEqual(b);
  });
});
