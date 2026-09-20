import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { reportOptionsSchema, runReport } from "./report-service.js";

const noopLogger: Logger = { log: () => {} };

// Same reasoning as pipeline-service.test.ts: force the deterministic
// fallback path so this suite never risks a real AI network call.
const ORIGINAL_AI_API_KEY = process.env.AI_API_KEY;
const ORIGINAL_AI_MODEL = process.env.AI_MODEL;

beforeEach(() => {
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  if (ORIGINAL_AI_API_KEY !== undefined) process.env.AI_API_KEY = ORIGINAL_AI_API_KEY;
  if (ORIGINAL_AI_MODEL !== undefined) process.env.AI_MODEL = ORIGINAL_AI_MODEL;
});

describe("reportOptionsSchema", () => {
  it("defaults format to table and allows file to be omitted", () => {
    const result = reportOptionsSchema.parse({});
    expect(result).toEqual({ format: "table" });
  });
});

describe("runReport", () => {
  it("aggregates real portfolio metrics from the bundled sample dataset", async () => {
    const result = await runReport({ format: "table" }, noopLogger);
    expect(result.status).toBe("reported");
    if (result.status !== "reported") throw new Error("unreachable");
    expect(result.batch.total).toBeGreaterThan(0);
    expect(result.batch.results).toHaveLength(result.batch.total);
    expect(result.batch.metrics.revenueAtRisk.amount).toBeGreaterThanOrEqual(0);
  });

  it("carries the requested format through to the result", async () => {
    const result = await runReport({ format: "json" }, noopLogger);
    if (result.status !== "reported") throw new Error("unreachable");
    expect(result.format).toBe("json");
  });

  it("returns an error for a nonexistent data file", async () => {
    const result = await runReport({ format: "table", file: "data/samples/does-not-exist.json" }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("never reports a simulated recovered amount exceeding revenue at risk", async () => {
    const result = await runReport({ format: "table" }, noopLogger);
    if (result.status !== "reported") throw new Error("unreachable");
    const { metrics } = result.batch;
    expect(metrics.simulatedRecoveredAmount.amount).toBeLessThanOrEqual(metrics.revenueAtRisk.amount);
  });
});
