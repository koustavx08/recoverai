import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { buildDeterministicDiagnosis } from "./deterministic-diagnosis.js";
import { buildDiagnosisEvidence } from "./evidence.js";
import { buildDiagnosisFacts } from "./facts.js";
import { diagnosisSchema, INTERVENTION_TYPES } from "./schema.js";
import type { DiagnosisInput } from "./types.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    transactionId: brand("txn_test"),
    amount: { amount: 10_000, currency: "INR" },
    paymentMethod: "card",
    transactionStatus: "failed",
    attemptCount: 1,
    failureCode: "issuer_decline",
    failureDescription: "The card issuer declined the transaction.",
    retryable: true,
    customerHistory: { totalTransactions: 4, successfulTransactions: 3, reliabilityScore: 0.75 },
    riskScore: 50,
    recoverabilityScore: 60,
    ...overrides,
  };
}

function diagnose(overrides: Partial<DiagnosisInput> = {}) {
  const i = input(overrides);
  const facts = buildDiagnosisFacts(i);
  const evidence = buildDiagnosisEvidence(i, facts);
  return buildDeterministicDiagnosis(i, facts, evidence, { now: NOW });
}

describe("buildDeterministicDiagnosis", () => {
  it("always produces schema-valid output", () => {
    const diagnosis = diagnose({});
    expect(() => diagnosisSchema.parse(diagnosis)).not.toThrow();
  });

  it("never claims to be an LLM result", () => {
    const diagnosis = diagnose({});
    expect(diagnosis.metadata.mode).toBe("deterministic");
    expect(diagnosis.metadata.provider).toBeNull();
    expect(diagnosis.metadata.model).toBeNull();
  });

  it("is deterministic given identical input", () => {
    const a = diagnose({});
    const b = diagnose({});
    expect(a).toEqual(b);
  });

  it("returns insufficient_evidence when there is not enough signal", () => {
    const diagnosis = diagnose({
      failureCode: "unknown",
      attemptCount: 1,
      customerHistory: undefined,
      riskScore: undefined,
      recoverabilityScore: undefined,
    });
    expect(diagnosis.category).toBe("insufficient_evidence");
    expect(diagnosis.recoverabilityAssessment).toBe("INSUFFICIENT_EVIDENCE");
    expect(diagnosis.interventionEligibility).toEqual(["HUMAN_REVIEW"]);
  });

  it("still classifies checkout abandonment (0 attempts) rather than treating it as insufficient evidence", () => {
    const diagnosis = diagnose({
      failureCode: "customer_abandoned",
      attemptCount: 0,
      customerHistory: undefined,
      riskScore: undefined,
      recoverabilityScore: undefined,
    });
    expect(diagnosis.category).toBe("checkout_abandonment");
  });

  it("never recommends RETRY or a retry when the failure is non-retryable", () => {
    const diagnosis = diagnose({ retryable: false });
    expect(diagnosis.category).toBe("non_retryable");
    expect(diagnosis.interventionEligibility).not.toContain("RETRY");
    expect(diagnosis.retryRecommendation.recommended).toBe(false);
    expect(diagnosis.retryRecommendation.maxAttempts).toBe(0);
  });

  it("classifies a repeated failure pattern once the attempt threshold is met", () => {
    const diagnosis = diagnose({ attemptCount: 3 });
    expect(diagnosis.category).toBe("repeated_failure");
  });

  it("classifies checkout abandonment", () => {
    const diagnosis = diagnose({ failureCode: "customer_abandoned", attemptCount: 1 });
    expect(diagnosis.category).toBe("checkout_abandonment");
  });

  it("classifies a refund-related transaction", () => {
    const diagnosis = diagnose({ transactionStatus: "refunded" });
    expect(diagnosis.category).toBe("refund_related");
  });

  it("only ever recommends interventions from the bounded set", () => {
    const cases: Array<Partial<DiagnosisInput>> = [
      { failureCode: "issuer_decline" },
      { failureCode: "insufficient_funds" },
      { failureCode: "upi_failure" },
      { failureCode: "network_timeout" },
      { failureCode: "expired_card" },
      { retryable: false },
      { attemptCount: 3 },
      { failureCode: "customer_abandoned", attemptCount: 1 },
      { transactionStatus: "refunded" },
      {
        failureCode: "unknown",
        customerHistory: undefined,
        riskScore: undefined,
        recoverabilityScore: undefined,
      },
    ];
    for (const overrides of cases) {
      const diagnosis = diagnose(overrides);
      for (const intervention of diagnosis.interventionEligibility) {
        expect(INTERVENTION_TYPES).toContain(intervention);
      }
    }
  });

  it("keeps confidence within [0, 1] and lower when evidence is thin", () => {
    const rich = diagnose({});
    const thin = diagnose({
      failureCode: "unknown",
      customerHistory: undefined,
      riskScore: undefined,
      recoverabilityScore: undefined,
    });
    expect(rich.confidence).toBeGreaterThanOrEqual(0);
    expect(rich.confidence).toBeLessThanOrEqual(1);
    expect(thin.confidence).toBeLessThan(rich.confidence);
  });

  it("reports a limitation when no customer history is available", () => {
    const diagnosis = diagnose({ customerHistory: undefined, riskScore: 40 });
    expect(diagnosis.limitations.some((l) => l.toLowerCase().includes("customer"))).toBe(true);
  });

  it("marks fallbackUsed only when a fallbackReason was supplied", () => {
    const i = input({});
    const facts = buildDiagnosisFacts(i);
    const evidence = buildDiagnosisEvidence(i, facts);
    const withoutReason = buildDeterministicDiagnosis(i, facts, evidence, { now: NOW });
    const withReason = buildDeterministicDiagnosis(i, facts, evidence, {
      now: NOW,
      fallbackReason: "AI provider error: boom",
    });
    expect(withoutReason.metadata.fallbackUsed).toBe(false);
    expect(withReason.metadata.fallbackUsed).toBe(true);
    expect(withReason.metadata.fallbackReason).toBe("AI provider error: boom");
  });
});
