import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { prioritizeTransaction } from "./deterministic-prioritization.js";
import type { PrioritizationInput } from "./types.js";

function input(overrides: Partial<PrioritizationInput> = {}): PrioritizationInput {
  return {
    transactionId: brand("txn_test"),
    amount: { amount: 100_00, currency: "INR" },
    riskScore: 50,
    recoverabilityScore: 50,
    expectedRecoveryAmount: { amount: 50_00, currency: "INR" },
    priority: "medium",
    retryable: true,
    attemptCount: 1,
    ...overrides,
  };
}

describe("prioritizeTransaction", () => {
  it("packages the already-computed priority tier unchanged", () => {
    const result = prioritizeTransaction(input({ priority: "critical" }));
    expect(result.priority).toBe("critical");
  });

  it("high-value, highly recoverable transaction reports the expected factors", () => {
    const result = prioritizeTransaction(
      input({
        amount: { amount: 60_000_00, currency: "INR" },
        recoverabilityScore: 75,
        priority: "critical",
      }),
    );
    expect(result.factors).toContain("transaction value is high");
    expect(result.factors).toContain("recoverability score is above threshold");
  });

  it("low-value, low-recoverability transaction reports the expected factors", () => {
    const result = prioritizeTransaction(
      input({ amount: { amount: 100, currency: "INR" }, recoverabilityScore: 10, priority: "low" }),
    );
    expect(result.factors).toContain("transaction value is low");
    expect(result.factors).toContain("recoverability score is low");
  });

  it("strong customer history is reported as a factor", () => {
    const result = prioritizeTransaction(
      input({ customerHistory: { totalTransactions: 10, successfulTransactions: 10, reliabilityScore: 1 } }),
    );
    expect(result.factors).toContain("customer has a strong successful payment history");
  });

  it("poor customer history is reported as a factor", () => {
    const result = prioritizeTransaction(
      input({ customerHistory: { totalTransactions: 10, successfulTransactions: 0, reliabilityScore: 0 } }),
    );
    expect(result.factors).toContain("customer has a poor payment history");
  });

  it("non-retryable failures are reported as a factor", () => {
    const result = prioritizeTransaction(input({ retryable: false }));
    expect(result.factors).toContain("failure category is non-retryable");
  });

  it("retry opportunity is reported when attempts remain", () => {
    const result = prioritizeTransaction(input({ retryable: true, attemptCount: 0 }));
    expect(result.factors).toContain("retry opportunity remains");
  });

  it("retry limit reached is reported once attempts are exhausted", () => {
    const result = prioritizeTransaction(input({ retryable: true, attemptCount: 3 }));
    expect(result.factors).toContain("retry limit reached");
  });

  it("keeps score within [0, 100]", () => {
    const result = prioritizeTransaction(input({ riskScore: 100, recoverabilityScore: 100 }));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("explanation always mentions the priority tier", () => {
    const result = prioritizeTransaction(input({ priority: "high" }));
    expect(result.explanation).toContain("HIGH");
  });

  it("is deterministic given identical input", () => {
    const a = prioritizeTransaction(input({}));
    const b = prioritizeTransaction(input({}));
    expect(a).toEqual(b);
  });
});
