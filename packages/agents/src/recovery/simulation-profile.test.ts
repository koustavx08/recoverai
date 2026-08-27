import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { Diagnosis, DiagnosisCategory, RecoverabilityAssessment } from "../diagnosis/schema.js";
import type { StrategyDecision } from "../strategy/schema.js";
import { computeSimulationProfile } from "./simulation-profile.js";
import type { RecoveryExecutionRequest } from "./types.js";

function diagnosis(
  category: DiagnosisCategory,
  recoverabilityAssessment: RecoverabilityAssessment = "POSSIBLY_RECOVERABLE",
): Diagnosis {
  return {
    transactionId: "txn_test",
    category,
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
    recoverabilityAssessment,
    retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "test" },
    interventionEligibility: ["HUMAN_REVIEW"],
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
}

function strategyDecision(strategy: StrategyDecision["strategy"]): StrategyDecision {
  return {
    transactionId: "txn_test",
    strategy,
    confidence: 0.6,
    rationale: "test",
    supportingEvidence: [
      {
        id: "evidence-failure-code",
        type: "transaction",
        source: "deterministic_engine:failure_classifier",
        fact: "test",
        relevance: "test",
        weight: 0.9,
      },
    ],
    expectedOutcome: "test",
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

function request(overrides: Partial<RecoveryExecutionRequest> = {}): RecoveryExecutionRequest {
  return {
    transactionId: brand("txn_test"),
    amount: { amount: 100_00, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    diagnosis: diagnosis("issuer_decline", "LIKELY_RECOVERABLE"),
    strategyDecision: strategyDecision("switch_payment_method"),
    expectedRecoveryAmount: { amount: 60_00, currency: "INR" },
    executionContext: { simulationMode: true },
    ...overrides,
  };
}

describe("computeSimulationProfile", () => {
  it("keeps probabilityOfSuccess within [0, 1]", () => {
    const profile = computeSimulationProfile(request({}));
    expect(profile.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(profile.probabilityOfSuccess).toBeLessThanOrEqual(1);
  });

  it("is deterministic given identical input", () => {
    const a = computeSimulationProfile(request({}));
    const b = computeSimulationProfile(request({}));
    expect(a).toEqual(b);
  });

  it("produces an explainable, non-empty factors list", () => {
    const profile = computeSimulationProfile(request({}));
    expect(profile.factors.length).toBeGreaterThan(0);
  });

  it("boosts probability when the customer has succeeded with an alternate method and the strategy is switch_payment_method", () => {
    const withHistory = computeSimulationProfile(request({ hasSucceededWithAlternateMethod: true }));
    const withoutHistory = computeSimulationProfile(request({ hasSucceededWithAlternateMethod: false }));
    expect(withHistory.probabilityOfSuccess).toBeGreaterThan(withoutHistory.probabilityOfSuccess);
  });

  it("does not apply the alternate-method boost for a different strategy", () => {
    const withHistory = computeSimulationProfile(
      request({ strategyDecision: strategyDecision("retry_payment"), hasSucceededWithAlternateMethod: true }),
    );
    const withoutHistory = computeSimulationProfile(
      request({ strategyDecision: strategyDecision("retry_payment"), hasSucceededWithAlternateMethod: false }),
    );
    expect(withHistory.probabilityOfSuccess).toBe(withoutHistory.probabilityOfSuccess);
  });

  it("lowers probability as prior attempts increase", () => {
    const fewAttempts = computeSimulationProfile(request({ attemptCount: 0 }));
    const manyAttempts = computeSimulationProfile(request({ attemptCount: 5 }));
    expect(manyAttempts.probabilityOfSuccess).toBeLessThanOrEqual(fewAttempts.probabilityOfSuccess);
  });

  it("gives a repeated_failure category a lower estimate than a fresh issuer_decline, all else equal", () => {
    const fresh = computeSimulationProfile(request({ diagnosis: diagnosis("issuer_decline", "LIKELY_RECOVERABLE") }));
    const repeated = computeSimulationProfile(
      request({ diagnosis: diagnosis("repeated_failure", "LIKELY_RECOVERABLE") }),
    );
    expect(repeated.probabilityOfSuccess).toBeLessThan(fresh.probabilityOfSuccess);
  });
});
