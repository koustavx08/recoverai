import { z } from "zod";

/**
 * These literal lists mirror the unions in
 * `@recoverai/core`'s `types/enums.ts`. Zod needs runtime values, not
 * types, so they're re-declared here — keep them in sync if core's enums
 * change.
 */
const TRANSACTION_STATUSES = [
  "succeeded",
  "failed",
  "pending",
  "refunded",
  "abandoned",
] as const;

const PAYMENT_METHODS = [
  "card",
  "upi",
  "netbanking",
  "wallet",
  "emi",
  "bank_transfer",
  "unknown",
] as const;

const PAYMENT_ATTEMPT_STATUSES = ["succeeded", "failed", "pending"] as const;

const FAILURE_REASON_CODES = [
  "issuer_decline",
  "insufficient_funds",
  "expired_card",
  "invalid_card",
  "invalid_payment_details",
  "upi_failure",
  "network_timeout",
  "processor_error",
  "risk_blocked",
  "customer_abandoned",
  "authentication_failed",
  "duplicate_attempt",
  "unknown",
] as const;

const CURRENCY_CODE = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO 4217 code, e.g. INR");

const NON_NEGATIVE_INTEGER_AMOUNT = z
  .number()
  .finite("amount must be a finite number")
  .int("amount must be an integer number of the smallest currency unit (e.g. paise)")
  .nonnegative("amount must not be negative");

/** Same rule as above, but coerces string input — CSV cells are always strings. */
const NON_NEGATIVE_INTEGER_AMOUNT_COERCED = z.coerce
  .number()
  .finite("amount must be a finite number")
  .int("amount must be an integer number of the smallest currency unit (e.g. paise)")
  .nonnegative("amount must not be negative");

const METADATA = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional();

/** The nested per-attempt shape used by the "rich" JSON record format. */
const rawAttemptSchema = z.object({
  id: z.string().min(1),
  transactionId: z.string().min(1).optional(),
  status: z.enum(PAYMENT_ATTEMPT_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  failureReasonCode: z.enum(FAILURE_REASON_CODES).optional(),
  providerErrorMessage: z.string().optional(),
  attemptedAt: z.string().min(1),
});

/**
 * "Rich" record shape: one full `Transaction`-like object per record,
 * including a nested `attempts` array. This is the shape of the
 * hand-authored fixtures in data/samples/transactions.json.
 */
export const richRawTransactionSchema = z.object({
  id: z.string().min(1),
  merchantId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.object({ amount: NON_NEGATIVE_INTEGER_AMOUNT, currency: CURRENCY_CODE }),
  status: z.enum(TRANSACTION_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  attempts: z.array(rawAttemptSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
  metadata: METADATA,
});
export type RichRawTransaction = z.infer<typeof richRawTransactionSchema>;

/**
 * "Flat" record shape: everything on one level, no nested attempts. This
 * is what CSV rows (and simple bulk-generated JSON) look like — a single
 * summary of the transaction's most recent state.
 */
export const flatRawTransactionSchema = z.object({
  id: z.string().min(1),
  merchantId: z.string().min(1),
  customerId: z.string().min(1),
  amount: NON_NEGATIVE_INTEGER_AMOUNT_COERCED,
  currency: CURRENCY_CODE,
  status: z.enum(TRANSACTION_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  failureReasonCode: z.enum(FAILURE_REASON_CODES).optional(),
  attemptCount: z.coerce.number().int().nonnegative().optional(),
  lastAttemptAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  metadata: METADATA,
});
export type FlatRawTransaction = z.infer<typeof flatRawTransactionSchema>;

export { TRANSACTION_STATUSES, PAYMENT_METHODS, FAILURE_REASON_CODES };
