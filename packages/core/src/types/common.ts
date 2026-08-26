/**
 * Branded primitive types shared across the domain layer.
 *
 * Branding prevents accidentally passing a raw string where a specific
 * identifier is expected (e.g. a CustomerId where a MerchantId is required).
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type TransactionId = Brand<string, "TransactionId">;
export type PaymentAttemptId = Brand<string, "PaymentAttemptId">;
export type CustomerId = Brand<string, "CustomerId">;
export type MerchantId = Brand<string, "MerchantId">;
export type RecoveryActionId = Brand<string, "RecoveryActionId">;
export type AgentDecisionId = Brand<string, "AgentDecisionId">;
export type AuditEventId = Brand<string, "AuditEventId">;

/** ISO-8601 timestamp string, e.g. "2026-08-26T10:15:00.000Z". */
export type ISODateString = Brand<string, "ISODateString">;

/** ISO 4217 currency code, e.g. "INR", "USD". */
export type CurrencyCode = string;

/**
 * Monetary amount stored in the smallest currency unit (e.g. paise for INR,
 * cents for USD) to avoid floating-point rounding errors.
 */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/** Free-form, JSON-serializable metadata attached to domain entities. */
export type Metadata = Record<string, string | number | boolean | null>;

export function brand<T extends string, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}
