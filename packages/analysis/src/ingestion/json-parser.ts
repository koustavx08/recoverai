export interface ParsedJsonRecord {
  readonly row: number;
  /** Present when the record has a nested `attempts` array. */
  readonly shape: "rich" | "flat";
  readonly raw: unknown;
}

/**
 * Parses raw JSON file content into an ordered list of candidate records.
 * Does not validate record contents — that's `raw-record-schema.ts`'s job.
 * Throws only when the file isn't valid JSON or isn't a top-level array,
 * since those are structural failures the whole ingestion should abort on.
 */
export function parseJsonRecords(content: string): readonly ParsedJsonRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`File is not valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Expected the JSON file to contain a top-level array of transaction records.",
    );
  }

  return parsed.map((raw, index) => ({
    row: index + 1,
    shape:
      typeof raw === "object" &&
      raw !== null &&
      Array.isArray((raw as { attempts?: unknown }).attempts)
        ? "rich"
        : "flat",
    raw,
  }));
}
