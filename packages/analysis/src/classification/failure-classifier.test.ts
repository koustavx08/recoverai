import { describe, expect, it } from "vitest";
import { brand, type ISODateString } from "@recoverai/core";
import type { NormalizedTransaction } from "../types.js";
import { classifyFailure } from "./failure-classifier.js";

function iso(s: string): ISODateString {
  return brand<string, "ISODateString">(s);
}

function baseTransaction(
  overrides: Partial<NormalizedTransaction>,
): NormalizedTransaction {
  const createdAt = iso("2025-06-01T00:00:00.000Z");
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

describe("classifyFailure", () => {
  it("classifies a transaction with zero attempts as customer_abandoned", () => {
    const tx = baseTransaction({
      status: "abandoned",
      attemptCount: 0,
      failureReasonCode: undefined,
    });
    const result = classifyFailure(tx);
    expect(result.code).toBe("customer_abandoned");
    expect(result.recoverable).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("classifies network_timeout with the documented deterministic profile", () => {
    const tx = baseTransaction({ failureReasonCode: "network_timeout", attemptCount: 1 });
    const result = classifyFailure(tx);
    expect(result.code).toBe("network_timeout");
    expect(result.confidence).toBe(0.96);
    expect(result.recoverable).toBe(true);
    expect(result.severity).toBe("medium");
    expect(result.description).toMatch(/timed out/i);
  });

  const directCodes = [
    "issuer_decline",
    "insufficient_funds",
    "upi_failure",
    "expired_card",
    "invalid_payment_details",
    "authentication_failed",
    "processor_error",
    "invalid_card",
    "risk_blocked",
  ] as const;

  for (const code of directCodes) {
    it(`classifies a transaction whose latest attempt failed with "${code}"`, () => {
      const tx = baseTransaction({ failureReasonCode: code, attemptCount: 1 });
      const result = classifyFailure(tx);
      expect(result.code).toBe(code);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  }

  it("falls back to unknown when there is no failure-reason signal at all", () => {
    const tx = baseTransaction({ failureReasonCode: undefined, attemptCount: 2 });
    const result = classifyFailure(tx);
    expect(result.code).toBe("unknown");
    expect(result.confidence).toBe(0.5); // deliberately low — no signal to be confident about
  });

  it("detects duplicate-submission patterns from attempt timestamps within the same method", () => {
    const tx = baseTransaction({
      attemptCount: 2,
      failureReasonCode: "issuer_decline",
      attempts: [
        {
          id: brand("atm_1"),
          transactionId: brand("txn_test"),
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "issuer_decline",
          attemptedAt: iso("2025-06-01T00:00:00.000Z"),
        },
        {
          id: brand("atm_2"),
          transactionId: brand("txn_test"),
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "issuer_decline",
          attemptedAt: iso("2025-06-01T00:00:20.000Z"), // 20s later, same method
        },
      ],
    });

    const result = classifyFailure(tx);
    expect(result.code).toBe("duplicate_attempt");
    expect(result.recoverable).toBe(false);
  });

  it("does not flag attempts far apart in time (or on different methods) as duplicates", () => {
    const tx = baseTransaction({
      attemptCount: 2,
      failureReasonCode: "issuer_decline",
      attempts: [
        {
          id: brand("atm_1"),
          transactionId: brand("txn_test"),
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "issuer_decline",
          attemptedAt: iso("2025-06-01T00:00:00.000Z"),
        },
        {
          id: brand("atm_2"),
          transactionId: brand("txn_test"),
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "issuer_decline",
          attemptedAt: iso("2025-06-01T01:00:00.000Z"), // 1 hour later
        },
      ],
    });

    expect(classifyFailure(tx).code).not.toBe("duplicate_attempt");
  });

  it("is a pure function of its input (deterministic)", () => {
    const tx = baseTransaction({
      failureReasonCode: "insufficient_funds",
      attemptCount: 1,
    });
    expect(classifyFailure(tx)).toEqual(classifyFailure(tx));
  });
});
