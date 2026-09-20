import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionId } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { RazorpayPaymentProvider } from "./razorpay-payment-provider.js";
import { RazorpayClient } from "./razorpay-client.js";

const CREDENTIALS = { keyId: "rzp_test_key", keySecret: "rzp_test_secret" };

function chargeRequest(id: string) {
  return {
    transactionId: brand<string, "TransactionId">(id) as TransactionId,
    amount: { amount: 50_000, currency: "INR" },
    paymentMethod: "card" as const,
  };
}

describe("RazorpayPaymentProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: RazorpayPaymentProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    provider = new RazorpayPaymentProvider(CREDENTIALS, new RazorpayClient(CREDENTIALS));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("charge", () => {
    it("creates a real Razorpay order and never claims the charge itself succeeded", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ id: "order_123", amount: 50_000, currency: "INR", status: "created" }), {
          status: 200,
        }),
      );

      const result = await provider.charge(chargeRequest("txn_1"));

      expect(result.succeeded).toBe(false);
      expect(result.providerReference).toBe("order_123");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.razorpay.com/v1/orders",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns a failed ChargeResult (never throws) when the Razorpay API rejects the request", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: { description: "Invalid currency" } }), { status: 400 }),
      );

      const result = await provider.charge(chargeRequest("txn_2"));

      expect(result.succeeded).toBe(false);
      expect(result.failureReasonCode).toBe("processor_error");
      expect(result.providerErrorMessage).toContain("Invalid currency");
    });
  });

  describe("getChargeStatus", () => {
    it("reports success only when a real payment against the order actually captured", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              { id: "pay_1", status: "failed", amount: 50_000, currency: "INR" },
              { id: "pay_2", status: "captured", amount: 50_000, currency: "INR" },
            ],
          }),
          { status: 200 },
        ),
      );

      const result = await provider.getChargeStatus("order_123");
      expect(result?.succeeded).toBe(true);
      expect(result?.providerReference).toBe("pay_2");
    });

    it("returns the latest payment's status when none captured", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: "pay_1", status: "failed", amount: 50_000, currency: "INR" }] }), {
          status: 200,
        }),
      );

      const result = await provider.getChargeStatus("order_123");
      expect(result?.succeeded).toBe(false);
      expect(result?.providerErrorMessage).toContain("failed");
    });

    it("returns null when the order has no payments yet", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));

      const result = await provider.getChargeStatus("order_123");
      expect(result).toBeNull();
    });

    it("returns null for an order id Razorpay doesn't recognize", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: { description: "not found" } }), { status: 400 }),
      );

      const result = await provider.getChargeStatus("order_does_not_exist");
      expect(result).toBeNull();
    });
  });
});
