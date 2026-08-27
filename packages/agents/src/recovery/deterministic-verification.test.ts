import { describe, expect, it } from "vitest";
import type { RecoveryExecutionResult } from "./schema.js";
import { verifyRecoveryExecution } from "./deterministic-verification.js";

function result(overrides: Partial<RecoveryExecutionResult> = {}): RecoveryExecutionResult {
  return {
    executionId: "exec_test",
    transactionId: "txn_test",
    strategy: "switch_payment_method",
    action: "auto_retry",
    outcome: "success",
    recoveredAmount: { amount: 100_00, currency: "INR" },
    simulationMode: true,
    executedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("verifyRecoveryExecution", () => {
  it("verifies a valid success result", () => {
    const verification = verifyRecoveryExecution(result({ outcome: "success", recoveredAmount: { amount: 5_000, currency: "INR" } }));
    expect(verification.verified).toBe(true);
    expect(verification.reasons).toEqual([]);
  });

  it("verifies a valid failure result", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "failure", recoveredAmount: { amount: 0, currency: "INR" } }),
    );
    expect(verification.verified).toBe(true);
  });

  it("invalidates success with a zero recovered amount", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "success", recoveredAmount: { amount: 0, currency: "INR" } }),
    );
    expect(verification.verified).toBe(false);
    expect(verification.reasons.some((r) => r.includes("success"))).toBe(true);
  });

  it("invalidates failure with a non-zero recovered amount", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "failure", recoveredAmount: { amount: 500, currency: "INR" } }),
    );
    expect(verification.verified).toBe(false);
  });

  it("invalidates blocked with a non-zero recovered amount", () => {
    const verification = verifyRecoveryExecution(
      result({
        outcome: "blocked",
        recoveredAmount: { amount: 500, currency: "INR" },
        blockedReason: "test",
      }),
    );
    expect(verification.verified).toBe(false);
  });

  it("invalidates blocked with no blockedReason recorded", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "blocked", recoveredAmount: { amount: 0, currency: "INR" }, blockedReason: undefined }),
    );
    expect(verification.verified).toBe(false);
    expect(verification.reasons.some((r) => r.includes("blockedReason"))).toBe(true);
  });

  it("invalidates a blockedReason present on a non-blocked outcome", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "success", blockedReason: "should not be here" }),
    );
    expect(verification.verified).toBe(false);
  });

  it("invalidates pending with a non-zero recovered amount", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "pending", recoveredAmount: { amount: 100, currency: "INR" } }),
    );
    expect(verification.verified).toBe(false);
  });

  it("invalidates not_executed with a non-zero recovered amount", () => {
    const verification = verifyRecoveryExecution(
      result({ outcome: "not_executed", recoveredAmount: { amount: 100, currency: "INR" } }),
    );
    expect(verification.verified).toBe(false);
  });

  it("enforces simulationMode must be true", () => {
    const verification = verifyRecoveryExecution(result({ simulationMode: false as true }));
    expect(verification.verified).toBe(false);
    expect(verification.reasons.some((r) => r.includes("simulationMode"))).toBe(true);
  });

  it("carries executionId and transactionId through to the verification result", () => {
    const verification = verifyRecoveryExecution(result({ executionId: "exec_1", transactionId: "txn_1" }));
    expect(verification.executionId).toBe("exec_1");
    expect(verification.transactionId).toBe("txn_1");
  });
});
