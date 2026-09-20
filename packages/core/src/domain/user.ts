import type { ISODateString, MerchantId, UserId } from "../types/common.js";

/**
 * A dashboard login, scoped to exactly one merchant — RecoverAI has no
 * cross-merchant admin role today, so every `User` reads/writes only its
 * own `merchantId`'s data (see the `TransactionRepository`/
 * `AuditEventRepository` `findByMerchant` methods this scoping relies on).
 * `passwordHash` is always a bcrypt hash — this type never carries a raw
 * password.
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly merchantId: MerchantId;
  readonly createdAt: ISODateString;
}
