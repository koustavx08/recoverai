import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
} from "../interfaces/payment-provider.js";
import type { RazorpayCredentials } from "./razorpay-config.js";

/**
 * Real Razorpay-backed `PaymentProvider`.
 *
 * TODO(razorpay-integration): implement using the Razorpay Orders/Payments
 * API. Intentionally unimplemented for now — RecoverAI must be able to run
 * fully on `PaymentSimulator` before any real payment credentials exist.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";

  constructor(private readonly credentials: RazorpayCredentials) {
    void this.credentials;
  }

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    throw new Error(
      "RazorpayPaymentProvider.charge is not implemented yet. Use PaymentSimulator for now.",
    );
  }

  async getChargeStatus(_providerReference: string): Promise<ChargeResult | null> {
    throw new Error(
      "RazorpayPaymentProvider.getChargeStatus is not implemented yet. Use PaymentSimulator for now.",
    );
  }
}
