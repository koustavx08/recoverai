import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { Diagnosis } from "../diagnosis/schema.js";
import type { LlmStrategyResponse } from "./schema.js";
import type { StrategyInput } from "./types.js";
import { validateLlmStrategyResponse } from "./validation.js";

const DIAGNOSIS: Diagnosis = {
  transactionId: "txn_00099",
  category: "issuer_decline",
  confidence: 0.6,
  evidence: [
    {
      id: "evidence-failure-code",
      type: "transaction",
      source: "deterministic_engine:failure_classifier",
      fact: "test",
      relevance: "test",
      weight: 0.9,
    },
  ],
  recoverabilityAssessment: "LIKELY_RECOVERABLE",
  retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "test" },
  interventionEligibility: ["ALTERNATE_PAYMENT_METHOD"],
  explanation: "test",
  limitations: [],
  metadata: {
    mode: "deterministic",
    provider: null,
    model: null,
    agentVersion: "diagnosis-agent@1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    fallbackUsed: false,
  },
};

const INPUT: StrategyInput = {
  transactionId: brand("txn_00099"),
  diagnosis: DIAGNOSIS,
  amount: { amount: 10_000, currency: "INR" },
  riskScore: 50,
  recoverabilityScore: 55,
  expectedRecoveryAmount: { amount: 5_500, currency: "INR" },
  priority: "medium",
  attemptCount: 1,
  retryable: true,
};

const KNOWN_IDS = new Set(["evidence-failure-code", "evidence-priority"]);
const ALLOWED_STRATEGIES = ["switch_payment_method", "wait_and_retry", "manual_followup"] as const;

function response(overrides: Partial<LlmStrategyResponse> = {}): LlmStrategyResponse {
  return {
    transactionId: "txn_00099",
    strategy: "switch_payment_method",
    confidence: 0.7,
    rationale: "test",
    evidenceIds: ["evidence-failure-code"],
    expectedOutcome: "test",
    limitations: [],
    ...overrides,
  };
}

describe("validateLlmStrategyResponse", () => {
  it("accepts a response grounded in known evidence and within the allowed strategy set", () => {
    const result = validateLlmStrategyResponse(response({}), INPUT, KNOWN_IDS, [...ALLOWED_STRATEGIES]);
    expect(result.ok).toBe(true);
  });

  it("rejects a response whose transactionId does not match the request", () => {
    const result = validateLlmStrategyResponse(
      response({ transactionId: "txn_wrong" }),
      INPUT,
      KNOWN_IDS,
      [...ALLOWED_STRATEGIES],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/transactionId/);
  });

  it("rejects a response citing an evidence id that was never provided", () => {
    const result = validateLlmStrategyResponse(
      response({ evidenceIds: ["evidence-invented"] }),
      INPUT,
      KNOWN_IDS,
      [...ALLOWED_STRATEGIES],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unknown evidence/);
  });

  it("rejects a strategy that is schema-valid but not policy-approved for this transaction", () => {
    const result = validateLlmStrategyResponse(
      response({ strategy: "no_action" }),
      INPUT,
      KNOWN_IDS,
      [...ALLOWED_STRATEGIES],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not policy-approved/);
  });

  it("accepts every strategy in the allowed set", () => {
    for (const strategy of ALLOWED_STRATEGIES) {
      const result = validateLlmStrategyResponse(
        response({ strategy }),
        INPUT,
        KNOWN_IDS,
        [...ALLOWED_STRATEGIES],
      );
      expect(result.ok).toBe(true);
    }
  });
});
