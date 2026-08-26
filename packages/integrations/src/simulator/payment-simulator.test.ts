import { describe, expect, it } from "vitest";
import { PaymentSimulator } from "./payment-simulator.js";
import type { ChargeRequest } from "../interfaces/payment-provider.js";
import type { TransactionId } from "@recoverai/core";

function request(id: string): ChargeRequest {
  return {
    transactionId: id as TransactionId,
    amount: { amount: 10000, currency: "INR" },
    paymentMethod: "card",
  };
}

describe("PaymentSimulator", () => {
  it("is deterministic for the same transaction id", async () => {
    const simulator = new PaymentSimulator();
    const first = await simulator.charge(request("txn_deterministic_1"));
    const second = await simulator.charge(request("txn_deterministic_1"));
    expect(second).toEqual(first);
  });

  it("can produce both successful and failed outcomes across inputs", async () => {
    const simulator = new PaymentSimulator({ successRate: 0.5 });
    const outcomes = await Promise.all(
      Array.from({ length: 50 }, (_, i) => simulator.charge(request(`txn_${i}`))),
    );
    expect(outcomes.some((o) => o.succeeded)).toBe(true);
    expect(outcomes.some((o) => !o.succeeded)).toBe(true);
  });

  it("never succeeds when successRate is 0", async () => {
    const simulator = new PaymentSimulator({ successRate: 0 });
    const result = await simulator.charge(request("txn_never"));
    expect(result.succeeded).toBe(false);
  });

  it("always succeeds when successRate is 1", async () => {
    const simulator = new PaymentSimulator({ successRate: 1 });
    const result = await simulator.charge(request("txn_always"));
    expect(result.succeeded).toBe(true);
  });
});
