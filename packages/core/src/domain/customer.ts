import type { CustomerId, MerchantId, Metadata, ISODateString } from "../types/common.js";

/** The end customer attempting to pay a merchant. */
export interface Customer {
  readonly id: CustomerId;
  readonly merchantId: MerchantId;
  /** Email is optional — some checkout flows only capture a phone number. */
  readonly email?: string;
  readonly phone?: string;
  readonly name?: string;
  readonly createdAt: ISODateString;
  readonly metadata?: Metadata;
}
