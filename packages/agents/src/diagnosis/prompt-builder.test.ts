import { describe, expect, it } from "vitest";
import { brand } from "@recoverai/core";
import { buildDiagnosisEvidence } from "./evidence.js";
import { buildDiagnosisFacts } from "./facts.js";
import { DiagnosisPromptBuilder } from "./prompt-builder.js";
import type { DiagnosisInput } from "./types.js";

const INPUT: DiagnosisInput = {
  transactionId: brand("txn_prompt_test"),
  amount: { amount: 42_00, currency: "INR" },
  paymentMethod: "upi",
  transactionStatus: "failed",
  attemptCount: 2,
  failureCode: "upi_failure",
  failureDescription: "The UPI collect request failed or expired before approval.",
  retryable: true,
  customerHistory: { totalTransactions: 3, successfulTransactions: 2, reliabilityScore: 0.67 },
  riskScore: 45,
  recoverabilityScore: 55,
};

function build() {
  const facts = buildDiagnosisFacts(INPUT);
  const evidence = buildDiagnosisEvidence(INPUT, facts);
  return new DiagnosisPromptBuilder().build({ input: INPUT, facts, evidence });
}

describe("DiagnosisPromptBuilder", () => {
  it("includes the transaction id, amount, and failure code in the prompt", () => {
    const { prompt } = build();
    expect(prompt).toContain("txn_prompt_test");
    expect(prompt).toContain("4200");
    expect(prompt).toContain("upi_failure");
  });

  it("includes the deterministic risk scores when available", () => {
    const { prompt } = build();
    expect(prompt).toContain("riskScore: 45");
    expect(prompt).toContain("recoverabilityScore: 55");
  });

  it("states scores as unavailable rather than fabricating them when absent", () => {
    const facts = buildDiagnosisFacts({ ...INPUT, riskScore: undefined, recoverabilityScore: undefined });
    const evidence = buildDiagnosisEvidence(
      { ...INPUT, riskScore: undefined, recoverabilityScore: undefined },
      facts,
    );
    const { prompt } = new DiagnosisPromptBuilder().build({
      input: { ...INPUT, riskScore: undefined, recoverabilityScore: undefined },
      facts,
      evidence,
    });
    expect(prompt).toContain("riskScore: unavailable");
    expect(prompt).toContain("recoverabilityScore: unavailable");
  });

  it("includes every evidence item's id and fact", () => {
    const facts = buildDiagnosisFacts(INPUT);
    const evidence = buildDiagnosisEvidence(INPUT, facts);
    const { prompt } = build();
    for (const item of evidence) {
      expect(prompt).toContain(item.id);
      expect(prompt).toContain(item.fact);
    }
  });

  it("includes the bounded category, recoverability, and intervention lists as domain rules", () => {
    const { prompt } = build();
    expect(prompt).toContain("Allowed category values:");
    expect(prompt).toContain("Allowed recoverabilityAssessment values:");
    expect(prompt).toContain("Allowed interventionEligibility values:");
  });

  it("instructs the model not to invent facts, respect the retryable flag, and avoid claiming money was recovered", () => {
    const { system } = build();
    expect(system.toLowerCase()).toContain("invent");
    expect(system).toContain("retryable");
    expect(system.toLowerCase()).toContain("money has been recovered");
  });

  it("never includes an API key or secret-like value in either prompt part", () => {
    const { system, prompt } = build();
    const combined = `${system}\n${prompt}`;
    expect(combined.toLowerCase()).not.toContain("api_key");
    expect(combined.toLowerCase()).not.toContain("apikey");
    expect(combined.toLowerCase()).not.toContain("secret");
    // Anthropic-shaped key prefix, not just the substring "sk-" (which also
    // appears legitimately inside the "evidence-risk-score" id).
    expect(combined).not.toMatch(/sk-ant-[a-zA-Z0-9_-]+/);
  });
});
