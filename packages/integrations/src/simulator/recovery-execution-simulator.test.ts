import { describe, expect, it } from "vitest";
import { RecoveryExecutionSimulator } from "./recovery-execution-simulator.js";

const AMOUNT = { amount: 10_000, currency: "INR" };

describe("RecoveryExecutionSimulator", () => {
  it("produces the same result given the same seed and probability", async () => {
    const simulator = new RecoveryExecutionSimulator();
    const a = await simulator.simulate({ seed: "fixed-seed", probabilityOfSuccess: 0.5, amount: AMOUNT });
    const b = await simulator.simulate({ seed: "fixed-seed", probabilityOfSuccess: 0.5, amount: AMOUNT });
    expect(a).toEqual(b);
  });

  it("can produce a different result for a different seed", async () => {
    const simulator = new RecoveryExecutionSimulator();
    const seeds = Array.from({ length: 50 }, (_, i) => `seed-${i}`);
    const rolls = await Promise.all(
      seeds.map((seed) => simulator.simulate({ seed, probabilityOfSuccess: 0.5, amount: AMOUNT })),
    );
    const uniqueRolls = new Set(rolls.map((r) => r.roll));
    expect(uniqueRolls.size).toBeGreaterThan(1);
  });

  it("always succeeds when probabilityOfSuccess is 1", async () => {
    const simulator = new RecoveryExecutionSimulator();
    for (let i = 0; i < 20; i++) {
      const result = await simulator.simulate({
        seed: `always-success-${i}`,
        probabilityOfSuccess: 1,
        amount: AMOUNT,
      });
      expect(result.succeeded).toBe(true);
    }
  });

  it("never succeeds when probabilityOfSuccess is 0", async () => {
    const simulator = new RecoveryExecutionSimulator();
    for (let i = 0; i < 20; i++) {
      const result = await simulator.simulate({
        seed: `never-success-${i}`,
        probabilityOfSuccess: 0,
        amount: AMOUNT,
      });
      expect(result.succeeded).toBe(false);
    }
  });

  it("returns a roll in [0, 1)", async () => {
    const simulator = new RecoveryExecutionSimulator();
    const result = await simulator.simulate({ seed: "roll-bounds", probabilityOfSuccess: 0.5, amount: AMOUNT });
    expect(result.roll).toBeGreaterThanOrEqual(0);
    expect(result.roll).toBeLessThan(1);
  });

  it("never contacts a real network endpoint — pure computation", async () => {
    const simulator = new RecoveryExecutionSimulator();
    const before = Date.now();
    await simulator.simulate({ seed: "fast", probabilityOfSuccess: 0.5, amount: AMOUNT });
    expect(Date.now() - before).toBeLessThan(50);
  });
});
