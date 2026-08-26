import type {
  TransactionId,
  PaymentAttemptId,
  CustomerId,
  MerchantId,
  Money,
  Metadata,
  ISODateString,
} from "../types/common.js";
import type {
  TransactionStatus,
  PaymentMethod,
  PaymentAttemptStatus,
  FailureReasonCode,
} from "../types/enums.js";

/**
 * A single charge attempt against a payment instrument. A Transaction may
 * have multiple PaymentAttempts (e.g. an initial failure followed by a
 * recovery retry).
 */
export interface PaymentAttempt {
  readonly id: PaymentAttemptId;
  readonly transactionId: TransactionId;
  readonly status: PaymentAttemptStatus;
  readonly paymentMethod: PaymentMethod;
  readonly failureReasonCode?: FailureReasonCode;
  /** Raw, provider-specific error message — kept for audit/debugging only. */
  readonly providerErrorMessage?: string;
  readonly attemptedAt: ISODateString;
}

/** A merchant-facing payment event tracked for revenue-recovery purposes. */
export interface Transaction {
  readonly id: TransactionId;
  readonly merchantId: MerchantId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly status: TransactionStatus;
  readonly paymentMethod: PaymentMethod;
  readonly attempts: readonly PaymentAttempt[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly metadata?: Metadata;
}
