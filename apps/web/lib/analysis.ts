import type { AnalysisResult } from "@recoverai/analysis";
import { analyzeTransactions, ingestFile } from "@recoverai/analysis";
import { createInMemoryDatabase } from "@recoverai/database";
import { repoDataPath } from "./pipeline-runtime";

/**
 * Server-only: runs the real deterministic ingestion + analysis pipeline
 * against the bundled sample dataset on every request. There is no
 * running database yet, so each request ingests fresh into an in-memory
 * store — the same approach the CLI's `analyze` command uses.
 */
const SAMPLE_DATA_PATH = repoDataPath("samples", "transactions.json");

export async function loadDashboardAnalysis(): Promise<AnalysisResult | null> {
  try {
    const db = createInMemoryDatabase();
    const { transactions } = await ingestFile({
      filePath: SAMPLE_DATA_PATH,
      repository: db.transactions,
    });
    if (transactions.length === 0) return null;
    return analyzeTransactions(transactions);
  } catch {
    return null;
  }
}
