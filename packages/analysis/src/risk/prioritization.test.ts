import { describe, expect, it } from "vitest";
import { brand, type RevenueRisk } from "@recoverai/core";
import { computePriorityBreakdown, sortCandidates } from "./prioritization.js";

function candidate(overrides: Partial<RevenueRisk>): RevenueRisk {
  return {
    transactionId: brand("txn"),
    riskScore: 50,
    recoverabilityScore: 50,
    expectedRecoveryAmount: { amount: 1000, currency: "INR" },
    failureReason: {
      code: "issuer_decline",
      description: "",
      recoverable: true,
      severity: "medium",
      confidence: 0.9,
      evidence: [],
    },
    priority: "medium",
    recommendedStrategy: "retry_payment",
    explanation: "",
    assessedAt: brand("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("sortCandidates", () => {
  it("sorts primarily by expectedRecoveryAmount, descending", () => {
    const candidates = [
      candidate({
        transactionId: brand("small"),
        expectedRecoveryAmount: { amount: 100, currency: "INR" },
      }),
      candidate({
        transactionId: brand("large"),
        expectedRecoveryAmount: { amount: 900, currency: "INR" },
      }),
      candidate({
        transactionId: brand("medium"),
        expectedRecoveryAmount: { amount: 500, currency: "INR" },
      }),
    ];
    const sorted = sortCandidates(candidates);
    expect(sorted.map((c) => c.transactionId)).toEqual(["large", "medium", "small"]);
  });

  it("breaks ties in expectedRecoveryAmount by riskScore, descending", () => {
    const candidates = [
      candidate({
        transactionId: brand("lower-risk"),
        expectedRecoveryAmount: { amount: 500, currency: "INR" },
        riskScore: 30,
      }),
      candidate({
        transactionId: brand("higher-risk"),
        expectedRecoveryAmount: { amount: 500, currency: "INR" },
        riskScore: 80,
      }),
    ];
    const sorted = sortCandidates(candidates);
    expect(sorted.map((c) => c.transactionId)).toEqual(["higher-risk", "lower-risk"]);
  });

  it("breaks remaining ties by recoverabilityScore, descending", () => {
    const candidates = [
      candidate({
        transactionId: brand("lower-recoverability"),
        expectedRecoveryAmount: { amount: 500, currency: "INR" },
        riskScore: 50,
        recoverabilityScore: 20,
      }),
      candidate({
        transactionId: brand("higher-recoverability"),
        expectedRecoveryAmount: { amount: 500, currency: "INR" },
        riskScore: 50,
        recoverabilityScore: 90,
      }),
    ];
    const sorted = sortCandidates(candidates);
    expect(sorted.map((c) => c.transactionId)).toEqual([
      "higher-recoverability",
      "lower-recoverability",
    ]);
  });

  it("does not mutate the input array", () => {
    const candidates = [
      candidate({ transactionId: brand("a") }),
      candidate({ transactionId: brand("b") }),
    ];
    const copy = [...candidates];
    sortCandidates(candidates);
    expect(candidates).toEqual(copy);
  });
});

describe("computePriorityBreakdown", () => {
  it("counts candidates per priority bucket", () => {
    const breakdown = computePriorityBreakdown([
      candidate({ priority: "critical" }),
      candidate({ priority: "critical" }),
      candidate({ priority: "high" }),
      candidate({ priority: "low" }),
    ]);
    expect(breakdown).toEqual({ critical: 2, high: 1, medium: 0, low: 1 });
  });

  it("returns all-zero counts for an empty candidate list", () => {
    expect(computePriorityBreakdown([])).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });
});
