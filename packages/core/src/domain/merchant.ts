import type { MerchantId, Metadata, ISODateString } from "../types/common.js";

/** A business that accepts payments through RecoverAI's monitored channels. */
export interface Merchant {
  readonly id: MerchantId;
  readonly name: string;
  readonly email: string;
  readonly websiteUrl?: string;
  readonly defaultCurrency: string;
  readonly createdAt: ISODateString;
  readonly metadata?: Metadata;
}
