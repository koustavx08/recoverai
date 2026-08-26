import { describe, expect, it } from "vitest";
import { brand, type ISODateString } from "@recoverai/core";
import { analyzeTransactions } from "./analyze.js";
import type { NormalizedTransaction } from "./types.js";

const NOW = new Date("2025-06-15T00:00:00.000Z");

function iso(s: string): ISODateString {
  return brand<string, "ISODateString">(s);
}

function tx(
  overrides: Partial<Omit<NormalizedTransaction, "id">> & { id?: string },
): NormalizedTransaction {
  const { id, ...rest } = overrides;
  const createdAt = iso("2025-06-14T00:00:00.000Z");
  return {
    id: brand(id ?? "txn"),
    merchantId: brand("mer_test"),
    customerId: brand("cus_test"),
    amount: { amount: 10_000, currency: "INR" },
    status: "succeeded",
    paymentMethod: "card",
    attempts: [],
    createdAt,
    updatedAt: createdAt,
    attemptCount: 1,
    lastAttemptAt: createdAt,
    source: "test",
    ...rest,
  };
}

describe("analyzeTransactions", () => {
  it("only produces recovery candidates for failed/abandoned transactions", () => {
    const result = analyzeTransactions(
      [
        tx({ id: "ok", status: "succeeded" }),
        tx({ id: "refunded", status: "refunded" }),
        tx({ id: "pending", status: "pending" }),
        tx({ id: "failed", status: "failed", failureReasonCode: "issuer_decline" }),
        tx({ id: "abandoned", status: "abandoned", attemptCount: 0 }),
      ],
      { now: NOW },
    );

    expect(result.transactionCount).toBe(5);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.transactionId).sort()).toEqual([
      "abandoned",
      "failed",
    ]);
  });

  it("computes revenue totals that add up correctly", () => {
    const result = analyzeTransactions(
      [
        tx({ id: "ok", status: "succeeded", amount: { amount: 5_000, currency: "INR" } }),
        tx({
          id: "failed",
          status: "failed",
          failureReasonCode: "insufficient_funds",
          amount: { amount: 3_000, currency: "INR" },
        }),
      ],
      { now: NOW },
    );

    expect(result.revenue.totalGmv.amount).toBe(8_000);
    expect(result.revenue.successfulAmount.amount).toBe(5_000);
    expect(result.revenue.revenueAtRiskAmount.amount).toBe(3_000);
    expect(result.revenue.estimatedRecoverableAmount.amount).toBe(
      result.candidates.reduce((sum, c) => sum + c.expectedRecoveryAmount.amount, 0),
    );
  });

  it("produces a failureBreakdown that sums to the number of candidates", () => {
    const result = analyzeTransactions(
      [
        tx({ id: "f1", status: "failed", failureReasonCode: "issuer_decline" }),
        tx({ id: "f2", status: "failed", failureReasonCode: "issuer_decline" }),
        tx({ id: "f3", status: "failed", failureReasonCode: "network_timeout" }),
      ],
      { now: NOW },
    );

    const total = Object.values(result.failureBreakdown).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(3);
    expect(result.failureBreakdown.issuer_decline).toBe(2);
  });

  it("produces a priorityBreakdown that sums to the number of candidates", () => {
    const result = analyzeTransactions(
      [
        tx({ id: "f1", status: "failed", failureReasonCode: "issuer_decline" }),
        tx({ id: "f2", status: "abandoned", attemptCount: 0 }),
      ],
      { now: NOW },
    );

    const total = Object.values(result.priorityBreakdown).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(result.candidates.length);
  });

  it("returns an empty candidate list and zeroed revenue-at-risk for an all-successful batch", () => {
    const result = analyzeTransactions([tx({ id: "ok", status: "succeeded" })], {
      now: NOW,
    });
    expect(result.candidates).toEqual([]);
    expect(result.revenue.revenueAtRiskAmount.amount).toBe(0);
    expect(result.revenue.estimatedRecoverableAmount.amount).toBe(0);
  });

  it("is deterministic given the same transactions and injected clock", () => {
    const transactions = [
      tx({ id: "f1", status: "failed", failureReasonCode: "upi_failure" }),
    ];
    expect(analyzeTransactions(transactions, { now: NOW })).toEqual(
      analyzeTransactions(transactions, { now: NOW }),
    );
  });
});
