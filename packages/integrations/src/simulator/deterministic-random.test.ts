import { describe, expect, it } from "vitest";
import { hashSeed, seededFloat } from "./deterministic-random.js";

describe("deterministic-random", () => {
  it("hashSeed is a pure function of its input", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });

  it("seededFloat always returns a value in [0, 1)", () => {
    for (const seed of ["a", "b", "transaction-123", ""]) {
      const value = seededFloat(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
