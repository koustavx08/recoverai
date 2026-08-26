import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { TransactionRepository } from "@recoverai/core";
import type {
  IngestionIssue,
  IngestionSourceFormat,
  IngestionSummary,
  NormalizedTransaction,
} from "../types.js";
import { parseCsvRecords } from "./csv-parser.js";
import { parseJsonRecords } from "./json-parser.js";
import { normalizeFlatRecord, normalizeRichRecord } from "./normalizer.js";
import {
  flatRawTransactionSchema,
  richRawTransactionSchema,
} from "./raw-record-schema.js";

const MAX_REPORTED_ISSUES = 25;

interface Candidate {
  readonly row: number;
  readonly shape: "rich" | "flat";
  readonly raw: unknown;
}

function detectFormat(filePath: string): IngestionSourceFormat {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".csv") return "csv";
  return "json";
}

/** Best-effort id extraction for issue reporting, without trusting the record's shape. */
function extractRecordId(raw: unknown): string | undefined {
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/** Parses a metadata cell/field in place if it's a JSON-encoded string (CSV always yields strings). */
function coerceMetadataField(raw: unknown): { raw: unknown; issue?: string } {
  if (typeof raw !== "object" || raw === null || !("metadata" in raw)) return { raw };
  const metadata = (raw as { metadata?: unknown }).metadata;
  if (typeof metadata !== "string" || metadata.length === 0) return { raw };

  try {
    const parsed: unknown = JSON.parse(metadata);
    return { raw: { ...raw, metadata: parsed } };
  } catch {
    return { raw, issue: "metadata column is not valid JSON" };
  }
}

function validateAndNormalize(
  candidate: Candidate,
  source: string,
  seenIds: Set<string>,
): { transaction: NormalizedTransaction } | { issue: IngestionIssue } {
  const recordId = extractRecordId(candidate.raw);

  const { raw, issue: metadataIssue } = coerceMetadataField(candidate.raw);
  if (metadataIssue) {
    return { issue: { row: candidate.row, reason: metadataIssue, recordId } };
  }

  if (candidate.shape === "rich") {
    const result = richRawTransactionSchema.safeParse(raw);
    if (!result.success) {
      return {
        issue: {
          row: candidate.row,
          reason: describeZodError(result.error),
          recordId,
        },
      };
    }
    if (seenIds.has(result.data.id)) {
      return {
        issue: {
          row: candidate.row,
          reason: `duplicate transaction id "${result.data.id}"`,
          recordId,
        },
      };
    }
    seenIds.add(result.data.id);
    return { transaction: normalizeRichRecord(result.data, source) };
  }

  const result = flatRawTransactionSchema.safeParse(raw);
  if (!result.success) {
    return {
      issue: { row: candidate.row, reason: describeZodError(result.error), recordId },
    };
  }
  if (seenIds.has(result.data.id)) {
    return {
      issue: {
        row: candidate.row,
        reason: `duplicate transaction id "${result.data.id}"`,
        recordId,
      },
    };
  }
  seenIds.add(result.data.id);
  return { transaction: normalizeFlatRecord(result.data, source) };
}

function describeZodError(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
  const first = error.issues[0];
  if (!first) return "record failed validation";
  const path = first.path.join(".") || "(root)";
  return `${path}: ${first.message}`;
}

export interface IngestOptions {
  readonly filePath: string;
  readonly format?: IngestionSourceFormat;
  readonly repository: TransactionRepository;
}

export interface IngestResult {
  readonly summary: IngestionSummary;
  /** Every successfully normalized record, in source order — the same objects that were saved via the repository, typed precisely (the repository's own return type only guarantees a plain `Transaction`). */
  readonly transactions: readonly NormalizedTransaction[];
}

/**
 * Reads, parses, validates, and normalizes a transaction file, saving every
 * valid record through the given repository. Malformed records are
 * skipped (not thrown on) so one bad row doesn't abort the whole batch —
 * they're reported back in the summary instead.
 */
export async function ingestFile(options: IngestOptions): Promise<IngestResult> {
  const format = options.format ?? detectFormat(options.filePath);
  const content = await readFile(options.filePath, "utf-8");

  const candidates: readonly Candidate[] =
    format === "csv"
      ? parseCsvRecords(content).map((r) => ({
          row: r.row,
          shape: "flat" as const,
          raw: r.raw,
        }))
      : parseJsonRecords(content).map((r) => ({
          row: r.row,
          shape: r.shape,
          raw: r.raw,
        }));

  const source = `${format}:${basename(options.filePath)}`;
  const seenIds = new Set<string>();
  const issues: IngestionIssue[] = [];
  const statusBreakdown: Partial<Record<NormalizedTransaction["status"], number>> = {};
  const transactions: NormalizedTransaction[] = [];
  let totalGmvAmount = 0;
  let currency: string | undefined;

  for (const candidate of candidates) {
    const result = validateAndNormalize(candidate, source, seenIds);
    if ("issue" in result) {
      if (issues.length < MAX_REPORTED_ISSUES) issues.push(result.issue);
      continue;
    }

    await options.repository.save(result.transaction);
    transactions.push(result.transaction);
    totalGmvAmount += result.transaction.amount.amount;
    currency ??= result.transaction.amount.currency;
    statusBreakdown[result.transaction.status] =
      (statusBreakdown[result.transaction.status] ?? 0) + 1;
  }

  const summary: IngestionSummary = {
    file: options.filePath,
    format,
    totalRecords: candidates.length,
    validRecords: transactions.length,
    invalidRecords: candidates.length - transactions.length,
    totalGmv: { amount: totalGmvAmount, currency: currency ?? "INR" },
    statusBreakdown,
    issues,
  };

  return { summary, transactions };
}
