import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { DIAGNOSIS_CATEGORIES, type Diagnosis, type DiagnosisCategory } from "../diagnosis/schema.js";
import {
  STRATEGY_POLICY_BY_CATEGORY,
  buildStrategyPolicyContext,
  isStrategyAllowedForCategory,
  requiresHumanApproval,
} from "./policy.js";
import type { StrategyInput } from "./types.js";

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
        fact: "test fact",
        relevance: "test relevance",
        weight: 0.9,
      },
    ],
    recoverabilityAssessment: "POSSIBLY_RECOVERABLE",
    retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "test" },
    interventionEligibility: ["HUMAN_REVIEW"],
    explanation: "test explanation",
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

describe("STRATEGY_POLICY_BY_CATEGORY", () => {
  it("defines a non-empty candidate list for every diagnosis category", () => {
    for (const category of DIAGNOSIS_CATEGORIES) {
      expect(STRATEGY_POLICY_BY_CATEGORY[category].length).toBeGreaterThan(0);
    }
  });
});

describe("isStrategyAllowedForCategory", () => {
  it("allows a strategy present in the category's policy list", () => {
    expect(isStrategyAllowedForCategory("issuer_decline", "switch_payment_method")).toBe(true);
  });

  it("blocks a strategy not present in the category's policy list", () => {
    expect(isStrategyAllowedForCategory("issuer_decline", "send_payment_link")).toBe(false);
  });

  it("blocks retry-based strategies for non_retryable", () => {
    expect(isStrategyAllowedForCategory("non_retryable", "retry_payment")).toBe(false);
    expect(isStrategyAllowedForCategory("non_retryable", "wait_and_retry")).toBe(false);
  });

  it("blocks retry-based strategies for insufficient_evidence", () => {
    expect(isStrategyAllowedForCategory("insufficient_evidence", "retry_payment")).toBe(false);
  });
});

describe("requiresHumanApproval", () => {
  it("always requires approval for manual_review", () => {
    expect(requiresHumanApproval("manual_review")).toBe(true);
  });

  it("does not require approval for no_action", () => {
    expect(requiresHumanApproval("no_action")).toBe(false);
  });

  it("requires approval for customer-facing strategies", () => {
    expect(requiresHumanApproval("send_payment_link")).toBe(true);
    expect(requiresHumanApproval("manual_followup")).toBe(true);
  });
});

describe("buildStrategyPolicyContext", () => {
  it("never returns an empty allowedStrategies set", () => {
    for (const category of DIAGNOSIS_CATEGORIES) {
      const context = buildStrategyPolicyContext(input({ diagnosis: diagnosis(category) }));
      expect(context.allowedStrategies.length).toBeGreaterThan(0);
    }
  });

  it("excludes retry-based strategies when the failure is non-retryable", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("issuer_decline"), retryable: false }),
    );
    expect(context.allowedStrategies).not.toContain("retry_payment");
    expect(context.allowedStrategies).not.toContain("wait_and_retry");
  });

  it("excludes retry-based strategies once the attempt cap is reached", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("network_timeout"), attemptCount: 5, retryable: true }),
    );
    expect(context.allowedStrategies).not.toContain("retry_payment");
    expect(context.allowedStrategies).not.toContain("wait_and_retry");
  });

  it("forces an escalation-only candidate set when recoverability is below the policy floor", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("upi_failure"), recoverabilityScore: 5 }),
    );
    for (const strategy of context.allowedStrategies) {
      expect(["manual_review", "no_action"]).toContain(strategy);
    }
  });

  it("falls back to manual_review if every candidate gets filtered out", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("network_timeout"), recoverabilityScore: 2, retryable: false }),
    );
    expect(context.allowedStrategies).toEqual(["manual_review"]);
    expect(context.preferredStrategy).toBe("manual_review");
  });

  it("prioritizes switch_payment_method when the customer has succeeded with an alternate method before", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("issuer_decline"), hasSucceededWithAlternateMethod: true }),
    );
    expect(context.preferredStrategy).toBe("switch_payment_method");
  });

  it("never re-adds a strategy a safety rule already excluded, even with alternate-method history", () => {
    const context = buildStrategyPolicyContext(
      input({
        diagnosis: diagnosis("upi_failure"),
        recoverabilityScore: 5,
        hasSucceededWithAlternateMethod: true,
      }),
    );
    expect(context.allowedStrategies).not.toContain("switch_payment_method");
  });

  it("selects manual_review as preferred for insufficient_evidence", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("insufficient_evidence") }),
    );
    expect(context.preferredStrategy).toBe("manual_review");
  });

  it("selects no_action as preferred for non_retryable", () => {
    const context = buildStrategyPolicyContext(
      input({ diagnosis: diagnosis("non_retryable"), retryable: false }),
    );
    expect(context.preferredStrategy).toBe("no_action");
  });

  it("is deterministic given identical input", () => {
    const a = buildStrategyPolicyContext(input({}));
    const b = buildStrategyPolicyContext(input({}));
    expect(a).toEqual(b);
  });
});
