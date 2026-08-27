import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { recoverOptionsSchema, runRecover } from "./recover-service.js";

const noopLogger: Logger = { log: () => {} };

// runRecover() -> buildStrategyContext() -> loadConfig() reads real
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

describe("recoverOptionsSchema", () => {
  it("requires a transaction id", () => {
    expect(() => recoverOptionsSchema.parse({})).toThrow();
  });

  it("defaults json and live to false and allows file/seed to be omitted", () => {
    const result = recoverOptionsSchema.parse({ transaction: "txn_00002" });
    expect(result).toEqual({ transaction: "txn_00002", json: false, live: false });
  });
});

describe("runRecover", () => {
  it("rejects --live outright", async () => {
    const result = await runRecover({ transaction: "txn_00002", json: false, live: true }, noopLogger);
    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("unreachable");
    expect(result.message.toLowerCase()).toContain("live");
  });

  it("returns an error for a transaction id that doesn't exist in the dataset", async () => {
    const result = await runRecover(
      { transaction: "txn_does_not_exist", json: false, live: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("returns an error for a nonexistent data file", async () => {
    const result = await runRecover(
      { transaction: "txn_00002", file: "data/samples/does-not-exist.json", json: false, live: false },
      noopLogger,
    );
    expect(result.status).toBe("error");
  });

  it("runs a full simulated recovery deterministically without AI credentials", async () => {
    const result = await runRecover({ transaction: "txn_00002", json: false, live: false }, noopLogger);
    expect(result.status).toBe("recovered");
    if (result.status !== "recovered") throw new Error("unreachable");
    expect(result.execution.transactionId).toBe("txn_00002");
    expect(result.execution.simulationMode).toBe(true);
    expect(["success", "failure", "pending", "blocked", "not_executed"]).toContain(result.execution.outcome);
    expect(result.verification.verified).toBe(true);
  });

  it("never produces a non-zero recoveredAmount unless the outcome is success", async () => {
    const result = await runRecover({ transaction: "txn_00009", json: false, live: false }, noopLogger);
    if (result.status !== "recovered") throw new Error("unreachable");
    if (result.execution.outcome !== "success") {
      expect(result.execution.recoveredAmount.amount).toBe(0);
    }
  });

  it("carries the json flag through to the result", async () => {
    const result = await runRecover({ transaction: "txn_00002", json: true, live: false }, noopLogger);
    if (result.status !== "recovered") throw new Error("unreachable");
    expect(result.json).toBe(true);
  });

  it("is deterministic given the same seed across repeated runs", async () => {
    const a = await runRecover(
      { transaction: "txn_00002", json: false, live: false, seed: "fixed-test-seed" },
      noopLogger,
    );
    const b = await runRecover(
      { transaction: "txn_00002", json: false, live: false, seed: "fixed-test-seed" },
      noopLogger,
    );
    if (a.status !== "recovered" || b.status !== "recovered") throw new Error("unreachable");
    expect(a.execution.outcome).toBe(b.execution.outcome);
    expect(a.execution.recoveredAmount).toEqual(b.execution.recoveredAmount);
  });
});
