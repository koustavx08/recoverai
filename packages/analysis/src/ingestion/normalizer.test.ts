import { describe, expect, it } from "vitest";
import { normalizeFlatRecord, normalizeRichRecord } from "./normalizer.js";
import type { FlatRawTransaction, RichRawTransaction } from "./raw-record-schema.js";

describe("normalizeRichRecord", () => {
  it("derives attemptCount and lastAttemptAt from the attempts array", () => {
    const record: RichRawTransaction = {
      id: "txn_1",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: { amount: 1000, currency: "INR" },
      status: "failed",
      paymentMethod: "card",
      attempts: [
        {
          id: "atm_1",
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "network_timeout",
          attemptedAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "atm_2",
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "issuer_decline",
          attemptedAt: "2025-01-01T01:00:00.000Z",
        },
      ],
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const normalized = normalizeRichRecord(record, "json:test.json");
    expect(normalized.attemptCount).toBe(2);
    expect(normalized.lastAttemptAt).toBe("2025-01-01T01:00:00.000Z");
    expect(normalized.failureReasonCode).toBe("issuer_decline");
    expect(normalized.source).toBe("json:test.json");
  });

  it("has no failureReasonCode when there are no failed attempts", () => {
    const record: RichRawTransaction = {
      id: "txn_2",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: { amount: 1000, currency: "INR" },
      status: "succeeded",
      paymentMethod: "card",
      attempts: [
        {
          id: "atm_1",
          status: "succeeded",
          paymentMethod: "card",
          attemptedAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    expect(
      normalizeRichRecord(record, "json:test.json").failureReasonCode,
    ).toBeUndefined();
  });

  it("falls back to createdAt for lastAttemptAt when there are no attempts", () => {
    const record: RichRawTransaction = {
      id: "txn_3",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: { amount: 1000, currency: "INR" },
      status: "abandoned",
      paymentMethod: "unknown",
      attempts: [],
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const normalized = normalizeRichRecord(record, "json:test.json");
    expect(normalized.attemptCount).toBe(0);
    expect(normalized.lastAttemptAt).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("normalizeFlatRecord", () => {
  it("defaults attemptCount to 1 for a non-abandoned status when omitted", () => {
    const record: FlatRawTransaction = {
      id: "txn_4",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: 1000,
      currency: "INR",
      status: "failed",
      paymentMethod: "upi",
      failureReasonCode: "upi_failure",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const normalized = normalizeFlatRecord(record, "csv:test.csv");
    expect(normalized.attemptCount).toBe(1);
    expect(normalized.attempts).toEqual([]);
    expect(normalized.failureReasonCode).toBe("upi_failure");
  });

  it("defaults attemptCount to 0 for an abandoned status when omitted", () => {
    const record: FlatRawTransaction = {
      id: "txn_5",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: 1000,
      currency: "INR",
      status: "abandoned",
      paymentMethod: "unknown",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    expect(normalizeFlatRecord(record, "csv:test.csv").attemptCount).toBe(0);
  });

  it("uses the explicit attemptCount when provided", () => {
    const record: FlatRawTransaction = {
      id: "txn_6",
      merchantId: "mer_1",
      customerId: "cus_1",
      amount: 1000,
      currency: "INR",
      status: "failed",
      paymentMethod: "card",
      attemptCount: 4,
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    expect(normalizeFlatRecord(record, "csv:test.csv").attemptCount).toBe(4);
  });
});
