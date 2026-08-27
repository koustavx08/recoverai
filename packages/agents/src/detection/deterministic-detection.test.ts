import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { detectRevenueRisk, DETECTION_RETRY_CAP } from "./deterministic-detection.js";
import type { DetectionInput } from "./types.js";

function input(overrides: Partial<DetectionInput> = {}): DetectionInput {
  return {
    transactionId: brand("txn_test"),
    status: "failed",
    amount: { amount: 100_00, currency: "INR" },
    attemptCount: 1,
    failureCode: "issuer_decline",
    retryable: true,
    ...overrides,
  };
}

describe("detectRevenueRisk", () => {
  it("marks a successful transaction as not detected, not actionable", () => {
    const result = detectRevenueRisk(input({ status: "succeeded" }));
    expect(result.detected).toBe(false);
    expect(result.actionable).toBe(false);
    expect(result.severity).toBe("none");
  });

  it("marks a pending transaction as not detected, not actionable", () => {
    const result = detectRevenueRisk(input({ status: "pending" }));
    expect(result.detected).toBe(false);
    expect(result.actionable).toBe(false);
  });

  it("marks a refunded transaction as detected but not actionable", () => {
    const result = detectRevenueRisk(input({ status: "refunded" }));
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(false);
  });

  it("marks a failed, retryable transaction with headroom as actionable", () => {
    const result = detectRevenueRisk(input({ status: "failed", retryable: true, attemptCount: 1 }));
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(true);
  });

  it("marks an abandoned transaction with 0 attempts as actionable", () => {
    const result = detectRevenueRisk(
      input({ status: "abandoned", attemptCount: 0, failureCode: "customer_abandoned" }),
    );
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(true);
  });

  it("marks a non-retryable failure as detected but not actionable", () => {
    const result = detectRevenueRisk(input({ retryable: false }));
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(false);
    expect(result.reason.toLowerCase()).toContain("non-retryable");
  });

  it("marks a transaction at the retry cap as detected but not actionable", () => {
    const result = detectRevenueRisk(input({ attemptCount: DETECTION_RETRY_CAP }));
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(false);
    expect(result.reason.toLowerCase()).toContain("retry limit");
  });

  it("marks a transaction just under the retry cap as actionable", () => {
    const result = detectRevenueRisk(input({ attemptCount: DETECTION_RETRY_CAP - 1 }));
    expect(result.actionable).toBe(true);
  });

  it("still classifies a transaction with no classification signal yet (failureCode/retryable absent)", () => {
    const result = detectRevenueRisk(input({ failureCode: undefined, retryable: undefined }));
    expect(result.detected).toBe(true);
    expect(result.actionable).toBe(true);
  });

  it("assigns higher severity to higher-value transactions", () => {
    const low = detectRevenueRisk(input({ amount: { amount: 100_00, currency: "INR" } }));
    const critical = detectRevenueRisk(input({ amount: { amount: 60_000_00, currency: "INR" } }));
    expect(low.severity).toBe("low");
    expect(critical.severity).toBe("critical");
  });

  it("is deterministic given identical input", () => {
    const a = detectRevenueRisk(input({}));
    const b = detectRevenueRisk(input({}));
    expect(a).toEqual(b);
  });
});
