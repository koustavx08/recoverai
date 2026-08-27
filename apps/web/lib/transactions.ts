import { ingestFile, type NormalizedTransaction } from "@recoverai/analysis";
import { createInMemoryDatabase } from "@recoverai/database";
import type { TransactionStatus } from "@recoverai/core";
import { repoDataPath } from "./pipeline-runtime";

const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

/** Statuses risk-eligible for the diagnosis drill-down — mirrors `@recoverai/analysis`'s own `RISK_ELIGIBLE_STATUSES` (failed/abandoned). */
const DRILL_DOWN_STATUSES: ReadonlySet<TransactionStatus> = new Set(["failed", "abandoned"]);

export function isDrillDownEligible(status: TransactionStatus): boolean {
  return DRILL_DOWN_STATUSES.has(status);
}

export interface TransactionListView {
  readonly transactions: readonly NormalizedTransaction[];
  readonly total: number;
  readonly statusCounts: Readonly<Record<TransactionStatus, number>>;
}

const EMPTY_STATUS_COUNTS: Record<TransactionStatus, number> = {
  succeeded: 0,
  failed: 0,
  pending: 0,
  refunded: 0,
  abandoned: 0,
};

/**
 * Server-only: ingests the bundled sample dataset and returns it (optionally
 * filtered to one status), newest first. Real ingested data only — nothing
 * here is generated or estimated.
 */
export async function loadTransactionList(
  statusFilter?: TransactionStatus,
): Promise<TransactionListView | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: SAMPLE_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;

    const statusCounts = { ...EMPTY_STATUS_COUNTS };
    for (const transaction of transactions) statusCounts[transaction.status]++;

    const filtered = statusFilter
      ? transactions.filter((transaction) => transaction.status === statusFilter)
      : transactions;
    const sorted = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return { transactions: sorted, total: transactions.length, statusCounts };
  } catch {
    return null;
  }
}
