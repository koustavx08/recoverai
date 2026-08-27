import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { Diagnosis, DiagnosisCategory } from "../diagnosis/schema.js";
import { buildDeterministicStrategy } from "./deterministic-strategy.js";
import { buildStrategyEvidence } from "./evidence.js";
import { buildStrategyPolicyContext } from "./policy.js";
import { strategyDecisionSchema } from "./schema.js";
import type { StrategyInput } from "./types.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function diagnosis(category: DiagnosisCategory): Diagnosis {
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
    recoverabilityAssessment: "POSSIBLY_RECOVERABLE",
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

function input(overrides: Partial<StrategyInput> = {}): StrategyInput {
  return {
    transactionId: brand("txn_test"),
    diagnosis: diagnosis("issuer_decline"),
    amount: { amount: 100_00, currency: "INR" },
    riskScore: 50,
    recoverabilityScore: 55,
    expectedRecoveryAmount: { amount: 55_00, currency: "INR" },
    priority: "medium",
    attemptCount: 1,
    retryable: true,
    ...overrides,
  };
}

function decide(overrides: Partial<StrategyInput> = {}) {
  const i = input(overrides);
  const evidence = buildStrategyEvidence(i);
  const policy = buildStrategyPolicyContext(i);
  return buildDeterministicStrategy(i, evidence, policy, { now: NOW });
}

describe("buildDeterministicStrategy", () => {
  it("always produces schema-valid output", () => {
    const decision = decide({});
    expect(() => strategyDecisionSchema.parse(decision)).not.toThrow();
  });

  it("never claims to be an LLM result", () => {
    const decision = decide({});
    expect(decision.metadata.mode).toBe("deterministic");
    expect(decision.metadata.provider).toBeNull();
    expect(decision.metadata.model).toBeNull();
  });

  it("is deterministic given identical input", () => {
    const a = decide({});
    const b = decide({});
    expect(a).toEqual(b);
  });

  it("only ever selects the policy's preferred strategy", () => {
    const i = input({});
    const policy = buildStrategyPolicyContext(i);
    const decision = decide({});
    expect(decision.strategy).toBe(policy.preferredStrategy);
  });

  it("never selects a retry-based strategy for a non-retryable failure", () => {
    const decision = decide({ diagnosis: diagnosis("non_retryable"), retryable: false });
    expect(decision.strategy).not.toBe("retry_payment");
    expect(decision.strategy).not.toBe("wait_and_retry");
  });

  it("requires human approval exactly when the policy says the selected strategy does", () => {
    const decision = decide({ diagnosis: diagnosis("refund_related") });
    expect(decision.strategy).toBe("manual_review");
    expect(decision.requiresHumanApproval).toBe(true);
  });

  it("does not require human approval for switch_payment_method", () => {
    const decision = decide({ diagnosis: diagnosis("issuer_decline") });
    expect(decision.strategy).toBe("switch_payment_method");
    expect(decision.requiresHumanApproval).toBe(false);
  });

  it("keeps confidence within [0, 1]", () => {
    const decision = decide({});
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it("never states a guaranteed recovered amount as expectedOutcome for an escalation strategy", () => {
    const decision = decide({ diagnosis: diagnosis("insufficient_evidence") });
    expect(decision.expectedOutcome.toLowerCase()).not.toContain("recovered");
  });

  it("carries the deterministic policy's constraints through unchanged", () => {
    const i = input({ diagnosis: diagnosis("upi_failure"), recoverabilityScore: 5 });
    const evidence = buildStrategyEvidence(i);
    const policy = buildStrategyPolicyContext(i);
    const decision = buildDeterministicStrategy(i, evidence, policy, { now: NOW });
    expect(decision.constraints).toEqual(policy.constraints);
    expect(decision.constraints.length).toBeGreaterThan(0);
  });

  it("marks fallbackUsed only when a fallbackReason was supplied", () => {
    const i = input({});
    const evidence = buildStrategyEvidence(i);
    const policy = buildStrategyPolicyContext(i);
    const withoutReason = buildDeterministicStrategy(i, evidence, policy, { now: NOW });
    const withReason = buildDeterministicStrategy(i, evidence, policy, {
      now: NOW,
      fallbackReason: "AI provider error: boom",
    });
    expect(withoutReason.metadata.fallbackUsed).toBe(false);
    expect(withReason.metadata.fallbackUsed).toBe(true);
    expect(withReason.metadata.fallbackReason).toBe("AI provider error: boom");
  });
});
