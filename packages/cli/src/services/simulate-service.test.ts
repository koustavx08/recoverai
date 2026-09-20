import { describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { runSimulate, simulateOptionsSchema } from "./simulate-service.js";

const noopLogger: Logger = { log: () => {} };

describe("simulateOptionsSchema", () => {
  it("defaults count to 10 and json to false", () => {
    const result = simulateOptionsSchema.parse({});
    expect(result).toEqual({ count: 10, json: false });
  });
});

describe("runSimulate", () => {
  it("runs count charge attempts through the real PaymentSimulator", async () => {
    const result = await runSimulate({ count: 20, json: false }, noopLogger);
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") throw new Error("unreachable");
    expect(result.count).toBe(20);
    expect(result.succeeded + result.failed).toBe(20);
    expect(result.sample.length).toBeLessThanOrEqual(10);
  });

  it("is deterministic given the same seed across repeated runs", async () => {
    const a = await runSimulate({ count: 15, seed: "fixed", json: false }, noopLogger);
    const b = await runSimulate({ count: 15, seed: "fixed", json: false }, noopLogger);
    if (a.status !== "simulated" || b.status !== "simulated") throw new Error("unreachable");
    expect(a.succeeded).toBe(b.succeeded);
    expect(a.failureBreakdown).toEqual(b.failureBreakdown);
    expect(a.sample).toEqual(b.sample);
  });

  it("produces a different outcome distribution for a different seed", async () => {
    const a = await runSimulate({ count: 50, seed: "seed-a", json: false }, noopLogger);
    const b = await runSimulate({ count: 50, seed: "seed-b", json: false }, noopLogger);
    if (a.status !== "simulated" || b.status !== "simulated") throw new Error("unreachable");
    expect(a.sample).not.toEqual(b.sample);
  });

  it("only counts a failure reason when the charge actually failed", async () => {
    const result = await runSimulate({ count: 30, json: false }, noopLogger);
    if (result.status !== "simulated") throw new Error("unreachable");
    const failureCount = Object.values(result.failureBreakdown).reduce((sum, n) => sum + n, 0);
    expect(failureCount).toBe(result.failed);
  });
});
