import { describe, expect, it } from "vitest";
import { ingestOptionsSchema, runIngest } from "./ingest-service.js";
import type { Logger } from "@recoverai/core";

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
});

describe("runIngest", () => {
  it("reports not_implemented until the ingestion pipeline exists", async () => {
    const result = await runIngest(
      { file: "data/samples/transactions.json" },
      noopLogger,
    );
    expect(result.status).toBe("not_implemented");
    expect(result.command).toBe("ingest");
  });
});
