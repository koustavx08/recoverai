import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { Diagnosis } from "../diagnosis/schema.js";
import { buildStrategyEvidence } from "./evidence.js";
import { buildStrategyPolicyContext } from "./policy.js";
import { StrategyPromptBuilder } from "./prompt-builder.js";
import type { StrategyInput } from "./types.js";

const DIAGNOSIS: Diagnosis = {
  transactionId: "txn_prompt_test",
  category: "issuer_decline",
  confidence: 0.6,
  evidence: [
    {
      id: "evidence-failure-code",
      type: "transaction",
      source: "deterministic_engine:failure_classifier",
      fact: "Failure classified as issuer_decline.",
      relevance: "Explains why the payment failed.",
      weight: 0.9,
    },
  ],
  recoverabilityAssessment: "LIKELY_RECOVERABLE",
  retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "retryable" },
  interventionEligibility: ["ALTERNATE_PAYMENT_METHOD"],
  explanation: "The card issuer declined the charge.",
  limitations: [],
  metadata: {
    mode: "deterministic",
    provider: null,
    model: null,
    agentVersion: "diagnosis-agent@1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    fallbackUsed: true,
    fallbackReason: "AI provider is not configured (AI_API_KEY/AI_MODEL unset).",
  },
};

const INPUT: StrategyInput = {
  transactionId: brand("txn_prompt_test"),
  diagnosis: DIAGNOSIS,
  amount: { amount: 42_00, currency: "INR" },
  riskScore: 45,
  recoverabilityScore: 55,
  expectedRecoveryAmount: { amount: 23_10, currency: "INR" },
  priority: "medium",
  attemptCount: 1,
  retryable: true,
  hasSucceededWithAlternateMethod: true,
};

function build() {
  const evidence = buildStrategyEvidence(INPUT);
  const policy = buildStrategyPolicyContext(INPUT);
  return new StrategyPromptBuilder().build({
    input: INPUT,
    evidence,
    allowedStrategies: policy.allowedStrategies,
    constraints: policy.constraints,
  });
}

describe("StrategyPromptBuilder", () => {
  it("includes the transaction id and diagnosis category", () => {
    const { prompt } = build();
    expect(prompt).toContain("txn_prompt_test");
    expect(prompt).toContain("issuer_decline");
  });

  it("includes the deterministic risk context", () => {
    const { prompt } = build();
    expect(prompt).toContain("riskScore: 45");
    expect(prompt).toContain("recoverabilityScore: 55");
    expect(prompt).toContain("priority: medium");
  });

  it("includes only the policy-approved allowed strategies, not the full universal enum", () => {
    const { prompt } = build();
    expect(prompt).toContain("switch_payment_method");
    // send_payment_link is never policy-approved for issuer_decline.
    expect(prompt).not.toContain("send_payment_link");
  });

  it("includes every evidence item's id and fact", () => {
    const evidence = buildStrategyEvidence(INPUT);
    const { prompt } = build();
    for (const item of evidence) {
      expect(prompt).toContain(item.id);
      expect(prompt).toContain(item.fact);
    }
  });

  it("instructs the model not to invent strategies, not to override policy, and never to claim revenue was recovered", () => {
    const { system } = build();
    expect(system.toLowerCase()).toContain("invent");
    expect(system.toLowerCase()).toContain("do not execute");
    expect(system.toLowerCase()).toContain("revenue has been recovered");
  });

  it("never includes an API key or secret-like value", () => {
    const { system, prompt } = build();
    const combined = `${system}\n${prompt}`;
    expect(combined.toLowerCase()).not.toContain("api_key");
    expect(combined.toLowerCase()).not.toContain("apikey");
    expect(combined.toLowerCase()).not.toContain("secret");
    expect(combined).not.toMatch(/sk-ant-[a-zA-Z0-9_-]+/);
  });
});
