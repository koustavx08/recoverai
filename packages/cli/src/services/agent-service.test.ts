import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { agentOptionsSchema, runAgent } from "./agent-service.js";

const noopLogger: Logger = { log: () => {} };

// runAgent() calls @recoverai/config's loadConfig(), which reads real
// process.env — force "no AI credentials configured" for every test here so
// this suite always exercises the deterministic path and never risks a real
// network call, regardless of what happens to be set in the shell running it.
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

describe("agentOptionsSchema", () => {
  it("defaults json to false and allows every other field to be omitted", () => {
    const result = agentOptionsSchema.parse({});
    expect(result).toEqual({ json: false });
  });
});

describe("runAgent", () => {
  it("reports not_implemented for stages other than diagnosis", async () => {
    const result = await runAgent({ stage: "prioritization", json: false }, noopLogger);
    expect(result.status).toBe("not_implemented");
  });

  it("reports not_implemented when no stage is given at all", async () => {
    const result = await runAgent({ json: false }, noopLogger);
    expect(result.status).toBe("not_implemented");
  });

  it("returns an error when --stage diagnosis is given without --transaction", async () => {
    const result = await runAgent({ stage: "diagnosis", json: false }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("returns an error for a transaction id that doesn't exist in the dataset", async () => {
    const result = await runAgent(
      { stage: "diagnosis", transaction: "txn_does_not_exist", json: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("returns an error for a nonexistent data file", async () => {
    const result = await runAgent(
      {
        stage: "diagnosis",
        transaction: "txn_00002",
        file: "data/samples/does-not-exist.json",
        json: false,
      },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("runs the diagnosis agent deterministically against the bundled sample dataset without AI credentials", async () => {
    const result = await runAgent(
      { stage: "diagnosis", transaction: "txn_00002", json: false },
      noopLogger,
    );
    expect(result.status).toBe("diagnosed");
    if (result.status !== "diagnosed") throw new Error("unreachable");
    expect(result.transactionId).toBe("txn_00002");
    expect(result.meta.mode).toBe("deterministic");
    expect(result.meta.fallbackUsed).toBe(true);
    expect(result.diagnosis.transactionId).toBe("txn_00002");
    expect(result.diagnosis.evidence.length).toBeGreaterThan(0);
  });

  it("carries the json flag through to the result", async () => {
    const result = await runAgent(
      { stage: "diagnosis", transaction: "txn_00002", json: true },
      noopLogger,
    );
    if (result.status !== "diagnosed") throw new Error("unreachable");
    expect(result.json).toBe(true);
  });

  it("is deterministic given the same transaction across repeated runs (no AI credentials configured)", async () => {
    const a = await runAgent({ stage: "diagnosis", transaction: "txn_00002", json: false }, noopLogger);
    const b = await runAgent({ stage: "diagnosis", transaction: "txn_00002", json: false }, noopLogger);
    if (a.status !== "diagnosed" || b.status !== "diagnosed") throw new Error("unreachable");
    expect(a.diagnosis.category).toBe(b.diagnosis.category);
    expect(a.diagnosis.confidence).toBe(b.diagnosis.confidence);
    expect(a.diagnosis.interventionEligibility).toEqual(b.diagnosis.interventionEligibility);
  });

  it("returns an error when --stage strategy is given without --transaction", async () => {
    const result = await runAgent({ stage: "strategy", json: false }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("returns an error for a strategy request against a transaction id that doesn't exist", async () => {
    const result = await runAgent(
      { stage: "strategy", transaction: "txn_does_not_exist", json: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("runs the strategy agent deterministically against the bundled sample dataset without AI credentials", async () => {
    const result = await runAgent(
      { stage: "strategy", transaction: "txn_00002", json: false },
      noopLogger,
    );
    expect(result.status).toBe("strategized");
    if (result.status !== "strategized") throw new Error("unreachable");
    expect(result.transactionId).toBe("txn_00002");
    expect(result.meta.mode).toBe("deterministic");
    expect(result.meta.fallbackUsed).toBe(true);
    expect(result.decision.transactionId).toBe("txn_00002");
    expect(result.decision.supportingEvidence.length).toBeGreaterThan(0);
    expect(typeof result.decision.requiresHumanApproval).toBe("boolean");
  });

  it("accepts the strategy_selection alias for --stage strategy", async () => {
    const result = await runAgent(
      { stage: "strategy_selection", transaction: "txn_00002", json: false },
      noopLogger,
    );
    expect(result.status).toBe("strategized");
  });

  it("carries the json flag through to a strategized result", async () => {
    const result = await runAgent(
      { stage: "strategy", transaction: "txn_00002", json: true },
      noopLogger,
    );
    if (result.status !== "strategized") throw new Error("unreachable");
    expect(result.json).toBe(true);
  });

  it("never recommends a retry-based strategy for a non-retryable transaction (txn_00009, refund_related)", async () => {
    const result = await runAgent(
      { stage: "strategy", transaction: "txn_00009", json: false },
      noopLogger,
    );
    if (result.status !== "strategized") throw new Error("unreachable");
    expect(result.decision.strategy).not.toBe("retry_payment");
    expect(result.decision.strategy).not.toBe("wait_and_retry");
  });

  it("returns an error for a nonexistent data file on the strategy stage", async () => {
    const result = await runAgent(
      {
        stage: "strategy",
        transaction: "txn_00002",
        file: "data/samples/does-not-exist.json",
        json: false,
      },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });
});
