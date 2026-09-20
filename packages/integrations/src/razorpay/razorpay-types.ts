/**
 * Narrow, hand-typed response shapes for the subset of Razorpay's REST API
 * this package actually calls. Deliberately not the full API surface —
 * only the fields `razorpay-payment-provider.ts`/
 * `razorpay-recovery-action-provider.ts` read.
 */

export interface RazorpayOrder {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
  readonly receipt?: string;
}

export interface RazorpayPayment {
  readonly id: string;
  readonly order_id?: string;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
}

export interface RazorpayPaymentsList {
  readonly items: readonly RazorpayPayment[];
}

export interface RazorpayPaymentLink {
  readonly id: string;
  readonly short_url: string;
  readonly status: string;
  readonly amount: number;
  readonly amount_paid?: number;
  readonly currency: string;
}
