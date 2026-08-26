/**
 * @recoverai/analysis
 *
 * Deterministic transaction ingestion and revenue-risk intelligence
 * pipeline: ingestion -> normalization -> validation -> failure
 * classification -> risk/recoverability scoring -> prioritization. No
 * model calls, no fabricated confidence, no claims of recovered revenue —
 * every number here is computed from the ingested transaction data by
 * documented, testable rules.
 */
export * from "./types.js";
export * from "./ingestion/index.js";
export * from "./classification/index.js";
export * from "./risk/index.js";
export * from "./analyze.js";
