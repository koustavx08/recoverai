import { describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { ingestOptionsSchema, runIngest } from "./ingest-service.js";

const noopLogger: Logger = { log: () => {} };

describe("ingestOptionsSchema", () => {
  it("requires a file path", () => {
    const result = ingestOptionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a valid file path", () => {
    const result = ingestOptionsSchema.safeParse({
      file: "data/samples/transactions.json",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported format value", () => {
    const result = ingestOptionsSchema.safeParse({ file: "x.json", format: "xml" });
    expect(result.success).toBe(false);
  });
});

describe("runIngest", () => {
  it("ingests the bundled sample dataset and reports a real summary", async () => {
    const result = await runIngest(
      { file: "data/samples/transactions.json" },
      noopLogger,
    );
    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") throw new Error("unreachable");
    expect(result.summary.totalRecords).toBe(12);
    expect(result.summary.validRecords).toBe(12);
    expect(result.summary.invalidRecords).toBe(0);
    expect(result.summary.totalGmv.currency).toBe("INR");
    expect(result.summary.totalGmv.amount).toBeGreaterThan(0);
  });

  it("returns an error result for a nonexistent file", async () => {
    const result = await runIngest(
      { file: "data/samples/does-not-exist.json" },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });
});
