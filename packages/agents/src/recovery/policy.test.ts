import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import type { Diagnosis, DiagnosisCategory } from "../diagnosis/schema.js";
import type { StrategyDecision } from "../strategy/schema.js";
import { canExecute, RECOVERY_MAX_RETRY_ATTEMPTS } from "./policy.js";
import type { RecoveryExecutionRequest } from "./types.js";

function diagnosis(category: DiagnosisCategory, retryRecommended = true): Diagnosis {
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
    retryRecommendation: { recommended: retryRecommended, maxAttempts: 2, reasoning: "test" },
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

function strategyDecision(overrides: Partial<StrategyDecision> = {}): StrategyDecision {
  return {
    transactionId: "txn_test",
    strategy: "switch_payment_method",
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
    ...overrides,
  };
}

function request(overrides: Partial<RecoveryExecutionRequest> = {}): RecoveryExecutionRequest {
  return {
    transactionId: brand("txn_test"),
    amount: { amount: 100_00, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    diagnosis: diagnosis("issuer_decline"),
    strategyDecision: strategyDecision(),
    expectedRecoveryAmount: { amount: 60_00, currency: "INR" },
    executionContext: { simulationMode: true },
    ...overrides,
  };
}

describe("canExecute", () => {
  it("allows a straightforward retryable strategy", () => {
    const decision = canExecute(request({}));
    expect(decision.allowed).toBe(true);
  });

  it("maps to the correct action for the allowed plan", () => {
    const decision = canExecute(request({}));
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.plan.action).toBe("auto_retry");
    expect(decision.plan.strategy).toBe("switch_payment_method");
  });

  it("always blocks manual_review", () => {
    const decision = canExecute(
      request({ strategyDecision: strategyDecision({ strategy: "manual_review", requiresHumanApproval: true }) }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.blockedReason).toMatch(/manual_review/);
  });

  it("blocks retry-based actions when the diagnosis category is non_retryable", () => {
    const decision = canExecute(
      request({
        diagnosis: diagnosis("non_retryable", false),
        strategyDecision: strategyDecision({ strategy: "retry_payment" }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.blockedReason).toMatch(/non-retryable/);
  });

  it("blocks retry-based actions when retryRecommendation.recommended is false, even without a non_retryable category", () => {
    const decision = canExecute(
      request({
        diagnosis: diagnosis("issuer_decline", false),
        strategyDecision: strategyDecision({ strategy: "wait_and_retry" }),
      }),
    );
    expect(decision.allowed).toBe(false);
  });

  it("blocks retry-based actions once the retry limit is reached", () => {
    const decision = canExecute(
      request({
        attemptCount: RECOVERY_MAX_RETRY_ATTEMPTS,
        strategyDecision: strategyDecision({ strategy: "retry_payment" }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.blockedReason).toMatch(/retry limit/i);
  });

  it("allows a retry-based action just under the retry limit", () => {
    const decision = canExecute(
      request({
        attemptCount: RECOVERY_MAX_RETRY_ATTEMPTS - 1,
        strategyDecision: strategyDecision({ strategy: "retry_payment" }),
      }),
    );
    expect(decision.allowed).toBe(true);
  });

  it("allows a strategy that requires human approval, flagging approvalRequired on the plan", () => {
    const decision = canExecute(
      request({
        strategyDecision: strategyDecision({ strategy: "manual_followup", requiresHumanApproval: true }),
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.plan.approvalRequired).toBe(true);
    expect(decision.plan.constraints.length).toBeGreaterThan(0);
  });

  it("allows no_action, mapping it to the none action", () => {
    const decision = canExecute(
      request({ strategyDecision: strategyDecision({ strategy: "no_action" }) }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.plan.action).toBe("none");
  });

  it("rejects a request whose executionContext isn't simulation mode", () => {
    const decision = canExecute(
      // Constructing a non-simulation context requires bypassing the
      // literal-true type (defense in depth), mirroring how a bug or a
      // deserialized/untyped payload might reach this function.
      request({ executionContext: { simulationMode: false as true } }),
    );
    expect(decision.allowed).toBe(false);
  });

  it("is deterministic given identical input (aside from the generated executionId)", () => {
    const a = canExecute(request({}));
    const b = canExecute(request({}));
    if (!a.allowed || !b.allowed) throw new Error("expected allowed");
    expect(a.plan.strategy).toBe(b.plan.strategy);
    expect(a.plan.action).toBe(b.plan.action);
    expect(a.plan.approvalRequired).toBe(b.plan.approvalRequired);
    expect(a.plan.constraints).toEqual(b.plan.constraints);
  });
});
