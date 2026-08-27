import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { pipelineRunOptionsSchema, runPipeline } from "./pipeline-service.js";

const noopLogger: Logger = { log: () => {} };

// runPipeline() -> buildPipelineAgents() -> resolveAIProvider() reads real
// process.env — force "no AI credentials configured" so this suite always
// exercises the deterministic path and never risks a real network call.
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

describe("pipelineRunOptionsSchema", () => {
  it("defaults json to false and allows every other field to be omitted", () => {
    const result = pipelineRunOptionsSchema.parse({});
    expect(result).toEqual({ json: false });
  });
});

describe("runPipeline — single transaction mode", () => {
  it("returns an error for a transaction id that doesn't exist in the dataset", async () => {
    const result = await runPipeline({ transaction: "txn_does_not_exist", json: false }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("returns an error for a nonexistent data file", async () => {
    const result = await runPipeline(
      { transaction: "txn_00002", file: "data/samples/does-not-exist.json", json: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("runs the full pipeline deterministically for a real transaction", async () => {
    const result = await runPipeline({ transaction: "txn_00002", json: false }, noopLogger);
    expect(result.status).toBe("pipeline_single");
    if (result.status !== "pipeline_single") throw new Error("unreachable");
    expect(result.result.transactionId).toBe("txn_00002");
    expect(["completed", "blocked", "skipped", "failed"]).toContain(result.result.status);
  });

  it("is deterministic given the same seed across repeated runs", async () => {
    const a = await runPipeline({ transaction: "txn_00002", json: false, seed: "fixed" }, noopLogger);
    const b = await runPipeline({ transaction: "txn_00002", json: false, seed: "fixed" }, noopLogger);
    if (a.status !== "pipeline_single" || b.status !== "pipeline_single") throw new Error("unreachable");
    expect(a.result.status).toBe(b.result.status);
    expect(a.result.execution?.result.outcome).toBe(b.result.execution?.result.outcome);
  });
});

describe("runPipeline — batch mode", () => {
  it("runs every transaction in the default sample dataset and aggregates results", async () => {
    const result = await runPipeline({ json: false }, noopLogger);
    expect(result.status).toBe("pipeline_batch");
    if (result.status !== "pipeline_batch") throw new Error("unreachable");
    expect(result.batch.total).toBeGreaterThan(0);
    expect(result.batch.results).toHaveLength(result.batch.total);
  });

  it("returns an error for a nonexistent batch file", async () => {
    const result = await runPipeline({ file: "data/samples/does-not-exist.json", json: false }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("carries the json flag through to a batch result", async () => {
    const result = await runPipeline({ json: true }, noopLogger);
    if (result.status !== "pipeline_batch") throw new Error("unreachable");
    expect(result.json).toBe(true);
  });
});
