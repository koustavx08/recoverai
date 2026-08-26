import type { CustomerId } from "@recoverai/core";
import type { NormalizedTransaction } from "../types.js";

export interface CustomerHistory {
  readonly totalTransactions: number;
  readonly successfulTransactions: number;
  /**
   * successfulTransactions / totalTransactions, i.e. how reliably this
   * customer's payments have gone through elsewhere in the ingested batch.
   * Defaults to a neutral 0.5 when there's only one transaction on record
   * (nothing to judge reliability from yet).
   */
  readonly reliabilityScore: number;
}

export const NEUTRAL_CUSTOMER_HISTORY: CustomerHistory = {
  totalTransactions: 1,
  successfulTransactions: 0,
  reliabilityScore: 0.5,
};

/**
 * Builds a per-customer reliability index from every transaction in the
 * current ingestion batch. This is intentionally batch-scoped (not
 * fetched from persistent history) — there is no cross-run database yet,
 * so "customer history" here means "this customer's other transactions in
 * the same dataset."
 */
export function buildCustomerHistoryIndex(
  transactions: readonly NormalizedTransaction[],
): ReadonlyMap<CustomerId, CustomerHistory> {
  const counts = new Map<CustomerId, { total: number; success: number }>();

  for (const tx of transactions) {
    const entry = counts.get(tx.customerId) ?? { total: 0, success: 0 };
    entry.total += 1;
    if (tx.status === "succeeded") entry.success += 1;
    counts.set(tx.customerId, entry);
  }

  const index = new Map<CustomerId, CustomerHistory>();
  for (const [customerId, { total, success }] of counts) {
    index.set(customerId, {
      totalTransactions: total,
      successfulTransactions: success,
      reliabilityScore: total > 1 ? success / total : 0.5,
    });
  }
  return index;
}
