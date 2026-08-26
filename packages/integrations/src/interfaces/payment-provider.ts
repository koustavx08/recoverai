import type { Money, PaymentMethod, TransactionId } from "@recoverai/core";

export interface ChargeRequest {
  readonly transactionId: TransactionId;
  readonly amount: Money;
  readonly paymentMethod: PaymentMethod;
}

export interface ChargeResult {
  readonly succeeded: boolean;
  readonly providerReference: string;
  readonly failureReasonCode?: string;
  readonly providerErrorMessage?: string;
}

/**
 * Abstraction over a real or simulated payment processor. The domain layer
 * and agents depend only on this interface — never on a concrete provider
 * such as Razorpay — so the recovery pipeline can run entirely against
 * `PaymentSimulator` without merchant credentials.
 */
export interface PaymentProvider {
  /** Stable identifier for logging/audit, e.g. "razorpay" or "simulator". */
  readonly name: string;

  /** Attempts to charge the given payment method for the given amount. */
  charge(request: ChargeRequest): Promise<ChargeResult>;

  /** Re-checks the status of a previously attempted charge, if supported. */
  getChargeStatus(providerReference: string): Promise<ChargeResult | null>;
}
