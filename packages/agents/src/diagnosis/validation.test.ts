import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { LlmDiagnosisResponse } from "./schema.js";
import type { DiagnosisInput } from "./types.js";
import { validateLlmDiagnosisResponse } from "./validation.js";

const INPUT: DiagnosisInput = {
  transactionId: brand("txn_00099"),
  amount: { amount: 10_000, currency: "INR" },
  paymentMethod: "card",
  transactionStatus: "failed",
  attemptCount: 1,
  failureCode: "issuer_decline",
  failureDescription: "The card issuer declined the transaction.",
  retryable: true,
};

const KNOWN_IDS = new Set(["evidence-failure-code", "evidence-attempt-count"]);

function response(overrides: Partial<LlmDiagnosisResponse> = {}): LlmDiagnosisResponse {
  return {
    transactionId: "txn_00099",
    category: "issuer_decline",
    confidence: 0.6,
    evidenceIds: ["evidence-failure-code"],
    recoverabilityAssessment: "LIKELY_RECOVERABLE",
    retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "retryable" },
    interventionEligibility: ["RETRY"],
    explanation: "test",
    limitations: [],
    ...overrides,
  };
}

describe("validateLlmDiagnosisResponse", () => {
  it("accepts a response grounded entirely in known evidence", () => {
    const result = validateLlmDiagnosisResponse(response({}), INPUT, KNOWN_IDS);
    expect(result.ok).toBe(true);
  });

  it("rejects a response whose transactionId does not match the request", () => {
    const result = validateLlmDiagnosisResponse(
      response({ transactionId: "txn_wrong" }),
      INPUT,
      KNOWN_IDS,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/transactionId/);
  });

  it("rejects a response citing an evidence id that was never provided", () => {
    const result = validateLlmDiagnosisResponse(
      response({ evidenceIds: ["evidence-invented-fact"] }),
      INPUT,
      KNOWN_IDS,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unknown evidence/);
  });

  it("rejects RETRY eligibility for a non-retryable failure", () => {
    const nonRetryableInput: DiagnosisInput = { ...INPUT, retryable: false };
    const result = validateLlmDiagnosisResponse(
      response({ interventionEligibility: ["RETRY"] }),
      nonRetryableInput,
      KNOWN_IDS,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/RETRY/);
  });

  it("rejects a recommended retry for a non-retryable failure even without RETRY in interventions", () => {
    const nonRetryableInput: DiagnosisInput = { ...INPUT, retryable: false };
    const result = validateLlmDiagnosisResponse(
      response({
        interventionEligibility: ["HUMAN_REVIEW"],
        retryRecommendation: { recommended: true, maxAttempts: 1, reasoning: "ignoring the flag" },
      }),
      nonRetryableInput,
      KNOWN_IDS,
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a non-retryable response that correctly declines to recommend a retry", () => {
    const nonRetryableInput: DiagnosisInput = { ...INPUT, retryable: false };
    const result = validateLlmDiagnosisResponse(
      response({
        interventionEligibility: ["HUMAN_REVIEW"],
        retryRecommendation: { recommended: false, maxAttempts: 0, reasoning: "not retryable" },
      }),
      nonRetryableInput,
      KNOWN_IDS,
    );
    expect(result.ok).toBe(true);
  });
});
