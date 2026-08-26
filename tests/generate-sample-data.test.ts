import { describe, expect, it } from "vitest";
import { generate, mulberry32, toCsv } from "../scripts/generate-sample-data.js";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("always returns a value in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("generate", () => {
  it("is deterministic for the same count and seed", () => {
    const a = generate(500, 42);
    const b = generate(500, 42);
    expect(a).toEqual(b);
  });

  it("produces different output for a different seed", () => {
    const a = generate(200, 1);
    const b = generate(200, 2);
    expect(a).not.toEqual(b);
  });

  it("produces exactly `count` transactions with unique ids", () => {
    const transactions = generate(1_000, 42);
    expect(transactions).toHaveLength(1_000);
    expect(new Set(transactions.map((t) => t.id)).size).toBe(1_000);
  });

  it("produces repeat customers (not one transaction per customer)", () => {
    const transactions = generate(1_000, 42);
    const customerCounts = new Map<string, number>();
    for (const t of transactions)
      customerCounts.set(t.customerId, (customerCounts.get(t.customerId) ?? 0) + 1);
    const repeatCustomers = [...customerCounts.values()].filter((count) => count > 1);
    expect(repeatCustomers.length).toBeGreaterThan(0);
  });

  it("produces more than one distinct outcome/status across a large batch", () => {
    const transactions = generate(2_000, 42);
    const statuses = new Set(transactions.map((t) => t.status));
    expect(statuses.size).toBeGreaterThan(1);
    expect(statuses.has("succeeded")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
  });

  it("gives abandoned transactions zero attempts and everything else at least one", () => {
    const transactions = generate(2_000, 42);
    for (const t of transactions) {
      if (t.status === "abandoned") expect(t.attempts).toHaveLength(0);
      else expect(t.attempts.length).toBeGreaterThan(0);
    }
  });

  it("produces a spread of transaction values rather than a single fixed amount", () => {
    const amounts = new Set(generate(500, 42).map((t) => t.amount.amount));
    expect(amounts.size).toBeGreaterThan(50);
  });
});

describe("toCsv", () => {
  it("produces one header row plus one row per transaction", () => {
    const transactions = generate(25, 42);
    const csv = toCsv(transactions);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(transactions.length + 1);
    expect(lines[0]).toBe(
      "id,merchantId,customerId,amount,currency,status,paymentMethod,failureReasonCode,attemptCount,lastAttemptAt,createdAt",
    );
  });
});
