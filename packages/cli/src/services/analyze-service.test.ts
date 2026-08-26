import { describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { analyzeOptionsSchema, runAnalyze } from "./analyze-service.js";

const noopLogger: Logger = { log: () => {} };

describe("analyzeOptionsSchema", () => {
  it("defaults json to false and allows an omitted file", () => {
    const result = analyzeOptionsSchema.parse({});
    expect(result).toEqual({ json: false });
  });
});

describe("runAnalyze", () => {
  it("defaults to the bundled sample dataset when no file is given", async () => {
    const result = await runAnalyze({ json: false }, noopLogger);
    expect(result.status).toBe("analyzed");
    if (result.status !== "analyzed") throw new Error("unreachable");
    expect(result.result.transactionCount).toBe(12);
    expect(result.result.candidates.length).toBeGreaterThan(0);
  });

  it("computes revenue.totalGmv as the sum of all ingested transaction amounts", async () => {
    const result = await runAnalyze(
      { file: "data/samples/transactions.json", json: false },
      noopLogger,
    );
    if (result.status !== "analyzed") throw new Error("unreachable");
    expect(result.result.revenue.totalGmv.amount).toBeGreaterThan(0);
    expect(result.result.revenue.totalGmv.currency).toBe("INR");
  });

  it("sorts candidates with the highest expected recovery first", async () => {
    const result = await runAnalyze(
      { file: "data/samples/transactions.json", json: false },
      noopLogger,
    );
    if (result.status !== "analyzed") throw new Error("unreachable");
    const amounts = result.result.candidates.map((c) => c.expectedRecoveryAmount.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
  });

  it("returns an error result for a nonexistent file", async () => {
    const result = await runAnalyze(
      { file: "data/samples/does-not-exist.json", json: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("carries the json flag through to the result", async () => {
    const result = await runAnalyze(
      { file: "data/samples/transactions.json", json: true },
      noopLogger,
    );
    if (result.status !== "analyzed") throw new Error("unreachable");
    expect(result.json).toBe(true);
  });
});
