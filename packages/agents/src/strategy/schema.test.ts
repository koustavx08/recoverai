import { describe, expect, it } from "vitest";
import { llmStrategyResponseSchema, strategyDecisionSchema } from "./schema.js";

function validDecision() {
  return {
    transactionId: "txn_00001",
    strategy: "switch_payment_method",
    confidence: 0.7,
    rationale: "Issuer decline, customer has an alternate method on file.",
    supportingEvidence: [
      {
        id: "evidence-failure-code",
        type: "transaction",
        source: "deterministic_engine:failure_classifier",
        fact: "Failure classified as issuer_decline.",
        relevance: "Explains why the payment failed.",
        weight: 0.9,
      },
    ],
    expectedOutcome: "May improve recovery odds; not a guarantee.",
    constraints: [],
    requiresHumanApproval: false,
    limitations: [],
    metadata: {
      mode: "deterministic",
      provider: null,
      model: null,
      agentVersion: "strategy-agent@1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      fallbackUsed: false,
    },
  };
}

describe("strategyDecisionSchema", () => {
  it("accepts a well-formed decision", () => {
    expect(() => strategyDecisionSchema.parse(validDecision())).not.toThrow();
  });

  it("rejects a missing transactionId", () => {
    const { transactionId: _drop, ...rest } = validDecision();
    expect(() => strategyDecisionSchema.parse(rest)).toThrow();
  });

  it("rejects an unrecognized strategy", () => {
    const invalid = { ...validDecision(), strategy: "call_customer_directly" };
    expect(() => strategyDecisionSchema.parse(invalid)).toThrow();
  });

  it("rejects confidence above 1", () => {
    const invalid = { ...validDecision(), confidence: 1.2 };
    expect(() => strategyDecisionSchema.parse(invalid)).toThrow();
  });

  it("rejects confidence below 0", () => {
    const invalid = { ...validDecision(), confidence: -0.2 };
    expect(() => strategyDecisionSchema.parse(invalid)).toThrow();
  });

  it("rejects an empty supportingEvidence array", () => {
    const invalid = { ...validDecision(), supportingEvidence: [] };
    expect(() => strategyDecisionSchema.parse(invalid)).toThrow();
  });

  it("rejects a malformed evidence reference (missing required fields)", () => {
    const invalid = {
      ...validDecision(),
      supportingEvidence: [{ id: "evidence-failure-code" }],
    };
    expect(() => strategyDecisionSchema.parse(invalid)).toThrow();
  });

  it("rejects a missing requiresHumanApproval field", () => {
    const { requiresHumanApproval: _drop, ...rest } = validDecision();
    expect(() => strategyDecisionSchema.parse(rest)).toThrow();
  });

  it("rejects a malformed decision missing rationale", () => {
    const { rationale: _drop, ...rest } = validDecision();
    expect(() => strategyDecisionSchema.parse(rest)).toThrow();
  });
});

describe("llmStrategyResponseSchema", () => {
  it("accepts a well-formed response referencing evidence by id", () => {
    const response = {
      transactionId: "txn_00001",
      strategy: "switch_payment_method",
      confidence: 0.7,
      rationale: "test",
      evidenceIds: ["evidence-failure-code"],
      expectedOutcome: "test",
      limitations: [],
    };
    expect(() => llmStrategyResponseSchema.parse(response)).not.toThrow();
  });

  it("rejects a response with no cited evidence ids", () => {
    const response = {
      transactionId: "txn_00001",
      strategy: "switch_payment_method",
      confidence: 0.7,
      rationale: "test",
      evidenceIds: [],
      expectedOutcome: "test",
      limitations: [],
    };
    expect(() => llmStrategyResponseSchema.parse(response)).toThrow();
  });

  it("does not accept requiresHumanApproval or constraints from the model (not part of this schema)", () => {
    const response = {
      transactionId: "txn_00001",
      strategy: "switch_payment_method",
      confidence: 0.7,
      rationale: "test",
      evidenceIds: ["evidence-failure-code"],
      expectedOutcome: "test",
      limitations: [],
      requiresHumanApproval: false,
      constraints: ["should be ignored"],
    };
    const parsed = llmStrategyResponseSchema.parse(response);
    expect(parsed).not.toHaveProperty("requiresHumanApproval");
    expect(parsed).not.toHaveProperty("constraints");
  });
});
