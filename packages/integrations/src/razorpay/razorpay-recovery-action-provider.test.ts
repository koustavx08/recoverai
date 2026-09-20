import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecoveryAction } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { RazorpayRecoveryActionProvider } from "./razorpay-recovery-action-provider.js";
import { RazorpayClient } from "./razorpay-client.js";

const CREDENTIALS = { keyId: "rzp_test_key", keySecret: "rzp_test_secret" };

function paymentLinkAction(metadata?: Record<string, string | number | boolean | null>): RecoveryAction {
  return {
    id: brand<string, "RecoveryActionId">("action_1"),
    transactionId: brand<string, "TransactionId">("txn_1"),
    type: "payment_link",
    strategy: "send_payment_link",
    status: "pending",
    metadata,
  };
}

describe("RazorpayRecoveryActionProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: RazorpayRecoveryActionProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    provider = new RazorpayRecoveryActionProvider(CREDENTIALS, new RazorpayClient(CREDENTIALS));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("execute", () => {
    it("creates a real Razorpay payment link for a payment_link action", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ id: "plink_1", short_url: "https://rzp.io/i/abc", status: "created", amount: 50_000, currency: "INR" }),
          { status: 200 },
        ),
      );

      const result = await provider.execute(paymentLinkAction({ amount: 50_000, currency: "INR" }));

      expect(result.succeeded).toBe(false);
      expect(result.notes).toContain("https://rzp.io/i/abc");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.razorpay.com/v1/payment_links",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws for action types Razorpay can't fulfill rather than pretending to act", async () => {
      const action: RecoveryAction = {
        id: brand<string, "RecoveryActionId">("action_2"),
        transactionId: brand<string, "TransactionId">("txn_2"),
        type: "auto_retry",
        strategy: "wait_and_retry",
        status: "pending",
      };

      await expect(provider.execute(action)).rejects.toThrow(/only supports "payment_link"/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when required amount/currency metadata is missing", async () => {
      await expect(provider.execute(paymentLinkAction())).rejects.toThrow(/requires action\.metadata\.amount/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("verify", () => {
    it("reports success and the real recovered amount when the link was paid", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ id: "plink_1", short_url: "https://rzp.io/i/abc", status: "paid", amount: 50_000, amount_paid: 50_000, currency: "INR" }),
          { status: 200 },
        ),
      );

      const result = await provider.verify(paymentLinkAction({ razorpayPaymentLinkId: "plink_1" }));
      expect(result.succeeded).toBe(true);
      expect(result.recoveredAmount).toEqual({ amount: 50_000, currency: "INR" });
    });

    it("reports failure without a recoveredAmount when the link is still unpaid", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ id: "plink_1", short_url: "https://rzp.io/i/abc", status: "created", amount: 50_000, currency: "INR" }),
          { status: 200 },
        ),
      );

      const result = await provider.verify(paymentLinkAction({ razorpayPaymentLinkId: "plink_1" }));
      expect(result.succeeded).toBe(false);
      expect(result.recoveredAmount).toBeUndefined();
    });

    it("throws when razorpayPaymentLinkId is missing from metadata", async () => {
      await expect(provider.verify(paymentLinkAction())).rejects.toThrow(/razorpayPaymentLinkId/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
