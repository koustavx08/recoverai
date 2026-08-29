import type { AnalysisResult } from "@recoverai/analysis";
import { analyzeTransactions } from "@recoverai/analysis";
import { createPrismaDatabase } from "@recoverai/database";
import { loadPersistedTransactions, repoDataPath } from "./pipeline-runtime";

/**
 * Server-only: runs the real deterministic ingestion + analysis pipeline
 * against every transaction persisted to the durable store (the bundled
 * sample dataset, seeded on every call, plus anything separately ingested
 * via `recoverai ingest`) — the same real, non-AI classification/scoring
 * the CLI's `analyze` command uses.
 */
const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

export async function loadDashboardAnalysis(): Promise<AnalysisResult | null> {
  try {
    const db = createPrismaDatabase();
    const transactions = await loadPersistedTransactions(db, SAMPLE_DATA_PATH);
    if (transactions.length === 0) return null;
    return analyzeTransactions(transactions);
  } catch {
    return null;
  }
}
