import { brand } from "@recoverai/core";
import type {
  CustomerId,
  FailureReasonCode,
  ISODateString,
  MerchantId,
  Metadata,
  PaymentAttempt,
  TransactionId,
} from "@recoverai/core";
import type { NormalizedTransaction } from "../types.js";
import type { FlatRawTransaction, RichRawTransaction } from "./raw-record-schema.js";

function latestAttemptedAt(
  attempts: readonly PaymentAttempt[],
  fallback: ISODateString,
): ISODateString {
  if (attempts.length === 0) return fallback;
  // ISO-8601 timestamps sort correctly as plain strings.
  return attempts.reduce(
    (latest, a) => (a.attemptedAt > latest ? a.attemptedAt : latest),
    attempts[0]!.attemptedAt,
  );
}

function latestFailureReasonCode(
  attempts: readonly PaymentAttempt[],
): FailureReasonCode | undefined {
  const failed = attempts.filter((a) => a.status === "failed" && a.failureReasonCode);
  if (failed.length === 0) return undefined;
  return failed.reduce(
    (latest, a) => (a.attemptedAt > latest.attemptedAt ? a : latest),
    failed[0]!,
  ).failureReasonCode;
}

export function normalizeRichRecord(
  record: RichRawTransaction,
  source: string,
): NormalizedTransaction {
  const id = brand<string, "TransactionId">(record.id) as TransactionId;
  const createdAt = brand<string, "ISODateString">(record.createdAt) as ISODateString;

  const attempts: readonly PaymentAttempt[] = record.attempts.map((a) => ({
    id: brand(a.id) as PaymentAttempt["id"],
    transactionId: id,
    status: a.status,
    paymentMethod: a.paymentMethod,
    failureReasonCode: a.failureReasonCode,
    providerErrorMessage: a.providerErrorMessage,
    attemptedAt: brand<string, "ISODateString">(a.attemptedAt) as ISODateString,
  }));

  const lastAttemptAt = latestAttemptedAt(attempts, createdAt);
  const updatedAt = record.updatedAt
    ? (brand<string, "ISODateString">(record.updatedAt) as ISODateString)
    : lastAttemptAt;

  return {
    id,
    merchantId: brand(record.merchantId) as MerchantId,
    customerId: brand(record.customerId) as CustomerId,
    amount: record.amount,
    status: record.status,
    paymentMethod: record.paymentMethod,
    attempts,
    createdAt,
    updatedAt,
    metadata: record.metadata as Metadata | undefined,
    attemptCount: attempts.length,
    lastAttemptAt,
    failureReasonCode: latestFailureReasonCode(attempts),
    source,
  };
}

export function normalizeFlatRecord(
  record: FlatRawTransaction,
  source: string,
): NormalizedTransaction {
  const id = brand<string, "TransactionId">(record.id) as TransactionId;
  const createdAt = brand<string, "ISODateString">(record.createdAt) as ISODateString;
  const lastAttemptAt = record.lastAttemptAt
    ? (brand<string, "ISODateString">(record.lastAttemptAt) as ISODateString)
    : createdAt;

  const defaultAttemptCount = record.status === "abandoned" ? 0 : 1;

  return {
    id,
    merchantId: brand(record.merchantId) as MerchantId,
    customerId: brand(record.customerId) as CustomerId,
    amount: { amount: record.amount, currency: record.currency },
    status: record.status,
    paymentMethod: record.paymentMethod,
    // Flat records don't carry per-attempt detail — attemptCount/lastAttemptAt
    // capture what we know without fabricating individual attempt objects.
    attempts: [],
    createdAt,
    updatedAt: lastAttemptAt,
    metadata: record.metadata as Metadata | undefined,
    attemptCount: record.attemptCount ?? defaultAttemptCount,
    lastAttemptAt,
    failureReasonCode: record.failureReasonCode,
    source,
  };
}
