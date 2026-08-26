import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DATA_DIR = resolve(__dirname, "../data/samples");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, filename), "utf-8")) as T;
}

interface SampleTransaction {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly metadata?: { readonly scenario?: string };
}

const EXPECTED_SCENARIOS = [
  "successful_payment",
  "issuer_decline",
  "insufficient_funds",
  "upi_failure",
  "network_timeout",
  "expired_card",
  "checkout_abandonment",
  "repeated_payment_failures",
  "refund",
];

describe("sample data", () => {
  const merchants = loadJson<Array<{ id: string }>>("merchants.json");
  const customers = loadJson<Array<{ id: string; merchantId: string }>>("customers.json");
  const transactions = loadJson<SampleTransaction[]>("transactions.json");

  it("has at least one merchant and customer", () => {
    expect(merchants.length).toBeGreaterThan(0);
    expect(customers.length).toBeGreaterThan(0);
  });

  it("covers every required failure/loss scenario", () => {
    const scenarios = new Set(transactions.map((t) => t.metadata?.scenario));
    for (const scenario of EXPECTED_SCENARIOS) {
      expect(scenarios.has(scenario)).toBe(true);
    }
  });

  it("references only merchants and customers that exist in the sample set", () => {
    const merchantIds = new Set(merchants.map((m) => m.id));
    const customerIds = new Set(customers.map((c) => c.id));

    for (const transaction of transactions) {
      expect(merchantIds.has(transaction.merchantId)).toBe(true);
      expect(customerIds.has(transaction.customerId)).toBe(true);
    }
  });

  it("has unique transaction ids", () => {
    const ids = transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
