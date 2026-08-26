import { describe, expect, it } from "vitest";
import { brand, type FailureReason, type ISODateString } from "@recoverai/core";
import type { NormalizedTransaction } from "../types.js";
import type { CustomerHistory } from "./customer-history.js";
import { HIGH_VALUE_ANCHOR_PAISE, scoreTransaction } from "./risk-scorer.js";

const NOW = new Date("2025-06-15T00:00:00.000Z");

const RELIABLE_HISTORY: CustomerHistory = {
  totalTransactions: 4,
  successfulTransactions: 4,
  reliabilityScore: 1,
};

const UNRELIABLE_HISTORY: CustomerHistory = {
  totalTransactions: 4,
  successfulTransactions: 0,
  reliabilityScore: 0,
};

function iso(s: string): ISODateString {
  return brand<string, "ISODateString">(s);
}

function transaction(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
  const createdAt = iso("2025-06-14T00:00:00.000Z");
  return {
    id: brand("txn_test"),
    merchantId: brand("mer_test"),
    customerId: brand("cus_test"),
    amount: { amount: 10000, currency: "INR" },
    status: "failed",
    paymentMethod: "card",
    attempts: [],
    createdAt,
    updatedAt: createdAt,
    attemptCount: 1,
    lastAttemptAt: createdAt,
    source: "test",
    ...overrides,
  };
}

function reason(overrides: Partial<FailureReason>): FailureReason {
  return {
    code: "issuer_decline",
    description: "test",
    recoverable: true,
    severity: "medium",
    confidence: 0.9,
    evidence: [],
    ...overrides,
  };
}

describe("scoreTransaction", () => {
  it("is deterministic given identical inputs", () => {
    const tx = transaction({});
    const r = reason({});
    const a = scoreTransaction(tx, r, RELIABLE_HISTORY, { now: NOW });
    const b = scoreTransaction(tx, r, RELIABLE_HISTORY, { now: NOW });
    expect(a).toEqual(b);
  });

  it("keeps riskScore and recoverabilityScore within [0, 100]", () => {
    const severities = ["low", "medium", "high", "critical"] as const;
    const amounts = [
      0,
      100,
      5_000_00,
      HIGH_VALUE_ANCHOR_PAISE,
      HIGH_VALUE_ANCHOR_PAISE * 10,
    ];
    const histories = [RELIABLE_HISTORY, UNRELIABLE_HISTORY];

    for (const severity of severities) {
      for (const amount of amounts) {
        for (const history of histories) {
          for (const recoverable of [true, false]) {
            const result = scoreTransaction(
              transaction({
                amount: { amount, currency: "INR" },
                attemptCount: 1 + Math.floor(amount % 5),
              }),
              reason({ severity, recoverable }),
              history,
              { now: NOW },
            );
            expect(result.riskScore).toBeGreaterThanOrEqual(0);
            expect(result.riskScore).toBeLessThanOrEqual(100);
            expect(result.recoverabilityScore).toBeGreaterThanOrEqual(0);
            expect(result.recoverabilityScore).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it("scores a higher-value transaction with a higher riskScore, all else equal", () => {
    const small = scoreTransaction(
      transaction({ amount: { amount: 1_000, currency: "INR" } }),
      reason({}),
      RELIABLE_HISTORY,
      { now: NOW },
    );
    const large = scoreTransaction(
      transaction({ amount: { amount: HIGH_VALUE_ANCHOR_PAISE, currency: "INR" } }),
      reason({}),
      RELIABLE_HISTORY,
      { now: NOW },
    );
    expect(large.riskScore).toBeGreaterThan(small.riskScore);
  });

  it("gives a retryable failure a higher recoverabilityScore than an otherwise-identical non-retryable one", () => {
    const retryable = scoreTransaction(
      transaction({}),
      reason({ recoverable: true }),
      RELIABLE_HISTORY,
      { now: NOW },
    );
    const nonRetryable = scoreTransaction(
      transaction({}),
      reason({ recoverable: false }),
      RELIABLE_HISTORY,
      {
        now: NOW,
      },
    );
    expect(retryable.recoverabilityScore).toBeGreaterThan(
      nonRetryable.recoverabilityScore,
    );
  });

  it("computes expectedRecoveryAmount as amount * (recoverabilityScore / 100), rounded", () => {
    const tx = transaction({ amount: { amount: 20_000, currency: "INR" } });
    const result = scoreTransaction(tx, reason({}), RELIABLE_HISTORY, { now: NOW });
    expect(result.expectedRecoveryAmount.amount).toBe(
      Math.round(20_000 * (result.recoverabilityScore / 100)),
    );
    expect(result.expectedRecoveryAmount.currency).toBe("INR");
  });

  it("never claims a recovered amount larger than the original transaction amount", () => {
    const tx = transaction({ amount: { amount: 5_000, currency: "INR" } });
    const result = scoreTransaction(tx, reason({}), RELIABLE_HISTORY, { now: NOW });
    expect(result.expectedRecoveryAmount.amount).toBeLessThanOrEqual(5_000);
  });

  it("rewards a more reliable customer history with higher recoverability, all else equal", () => {
    const tx = transaction({});
    const reliable = scoreTransaction(tx, reason({}), RELIABLE_HISTORY, { now: NOW });
    const unreliable = scoreTransaction(tx, reason({}), UNRELIABLE_HISTORY, { now: NOW });
    expect(reliable.recoverabilityScore).toBeGreaterThan(unreliable.recoverabilityScore);
  });

  it("decays recoverability for a stale failure relative to a fresh one", () => {
    const fresh = scoreTransaction(
      transaction({ lastAttemptAt: iso("2025-06-14T23:00:00.000Z") }),
      reason({}),
      RELIABLE_HISTORY,
      { now: NOW },
    );
    const stale = scoreTransaction(
      transaction({ lastAttemptAt: iso("2025-01-01T00:00:00.000Z") }),
      reason({}),
      RELIABLE_HISTORY,
      { now: NOW },
    );
    expect(fresh.recoverabilityScore).toBeGreaterThan(stale.recoverabilityScore);
  });

  it("assigns a recognized recovery strategy for every failure code", () => {
    const tx = transaction({});
    const result = scoreTransaction(
      tx,
      reason({ code: "risk_blocked", recoverable: false }),
      RELIABLE_HISTORY,
      {
        now: NOW,
      },
    );
    expect(result.recommendedStrategy).toBe("no_action");
  });
});
