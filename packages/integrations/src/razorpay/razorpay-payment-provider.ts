import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
} from "../interfaces/payment-provider.js";
import type { RazorpayCredentials } from "./razorpay-config.js";
import { RazorpayApiError, RazorpayClient } from "./razorpay-client.js";
import type { RazorpayPaymentsList } from "./razorpay-types.js";

/**
 * Real Razorpay-backed `PaymentProvider`.
 *
 * Razorpay has no server-initiated "charge this card now" endpoint
 * without a previously-saved payment token — a token RecoverAI never
 * stores (see README §11: no real customer contact/payment data exists
 * in this data model). `charge()` therefore creates a real Razorpay
 * Order (a genuine, verifiable payment *intent* the customer must still
 * complete via Razorpay Checkout) and always returns `succeeded: false`
 * — it never claims a charge completed that didn't. `getChargeStatus()`
 * reports whatever Razorpay's own Orders/Payments API says actually
 * happened.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";
  private readonly client: RazorpayClient;

  constructor(credentials: RazorpayCredentials, client?: RazorpayClient) {
    this.client = client ?? new RazorpayClient(credentials);
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    try {
      const order = await this.client.request<{ id: string }>("POST", "/orders", {
        amount: request.amount.amount,
        currency: request.amount.currency,
        receipt: request.transactionId,
        notes: { transactionId: request.transactionId },
      });

      return {
        succeeded: false,
        providerReference: order.id,
        providerErrorMessage:
          "Order created — awaiting customer checkout completion. Razorpay has no server-initiated charge without a saved payment token.",
      };
    } catch (error) {
      return {
        succeeded: false,
        providerReference: request.transactionId,
        failureReasonCode: "processor_error",
        providerErrorMessage: error instanceof RazorpayApiError ? error.message : String(error),
      };
    }
  }

  /** Looks up the real payments made against a previously-created order and reports whether any of them actually captured. */
  async getChargeStatus(providerReference: string): Promise<ChargeResult | null> {
    let payments: RazorpayPaymentsList;
    try {
      payments = await this.client.request<RazorpayPaymentsList>(
        "GET",
        `/orders/${providerReference}/payments`,
      );
    } catch (error) {
      if (error instanceof RazorpayApiError && error.status === 400) return null;
      throw error;
    }

    const captured = payments.items.find((payment) => payment.status === "captured");
    if (captured) {
      return { succeeded: true, providerReference: captured.id };
    }

    const latest = payments.items.at(-1);
    if (!latest) return null;

    return {
      succeeded: false,
      providerReference: latest.id,
      providerErrorMessage: `Payment status: ${latest.status}.`,
    };
  }
}
