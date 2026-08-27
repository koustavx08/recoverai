import { describe, expect, it } from "vitest";
import {
  recoveryExecutionPlanSchema,
  recoveryExecutionResultSchema,
  recoveryVerificationResultSchema,
} from "./schema.js";

function validPlan() {
  return {
    executionId: "exec_1",
    transactionId: "txn_1",
    strategy: "switch_payment_method",
    action: "auto_retry",
    simulationMode: true,
    constraints: [],
    approvalRequired: false,
  };
}

function validResult() {
  return {
    executionId: "exec_1",
    transactionId: "txn_1",
    strategy: "switch_payment_method",
    action: "auto_retry",
    outcome: "success",
    recoveredAmount: { amount: 1000, currency: "INR" },
    simulationMode: true,
    executedAt: "2026-01-01T00:00:00.000Z",
    metadata: { simulated: true },
  };
}

describe("recoveryExecutionPlanSchema", () => {
  it("accepts a well-formed plan", () => {
    expect(() => recoveryExecutionPlanSchema.parse(validPlan())).not.toThrow();
  });

  it("rejects an unrecognized action", () => {
    expect(() => recoveryExecutionPlanSchema.parse({ ...validPlan(), action: "call_customer" })).toThrow();
  });

  it("rejects an unrecognized strategy", () => {
    expect(() => recoveryExecutionPlanSchema.parse({ ...validPlan(), strategy: "refund_now" })).toThrow();
  });

  it("rejects simulationMode: false", () => {
    expect(() => recoveryExecutionPlanSchema.parse({ ...validPlan(), simulationMode: false })).toThrow();
  });
});

describe("recoveryExecutionResultSchema", () => {
  it("accepts a well-formed result", () => {
    expect(() => recoveryExecutionResultSchema.parse(validResult())).not.toThrow();
  });

  it("rejects an unrecognized outcome", () => {
    expect(() => recoveryExecutionResultSchema.parse({ ...validResult(), outcome: "refunded" })).toThrow();
  });

  it("rejects an unrecognized action", () => {
    expect(() => recoveryExecutionResultSchema.parse({ ...validResult(), action: "wire_transfer" })).toThrow();
  });

  it("rejects simulationMode: false", () => {
    expect(() => recoveryExecutionResultSchema.parse({ ...validResult(), simulationMode: false })).toThrow();
  });

  it("rejects a missing executionId", () => {
    const { executionId: _drop, ...rest } = validResult();
    expect(() => recoveryExecutionResultSchema.parse(rest)).toThrow();
  });

  it("rejects a non-flat metadata value", () => {
    expect(() =>
      recoveryExecutionResultSchema.parse({ ...validResult(), metadata: { nested: { not: "flat" } } }),
    ).toThrow();
  });
});

describe("recoveryVerificationResultSchema", () => {
  it("accepts a well-formed verification result", () => {
    const result = {
      executionId: "exec_1",
      transactionId: "txn_1",
      verified: true,
      reasons: [],
      checkedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => recoveryVerificationResultSchema.parse(result)).not.toThrow();
  });

  it("rejects a missing verified field", () => {
    const result = {
      executionId: "exec_1",
      transactionId: "txn_1",
      reasons: [],
      checkedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => recoveryVerificationResultSchema.parse(result)).toThrow();
  });
});
