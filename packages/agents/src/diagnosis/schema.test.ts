import { describe, expect, it } from "vitest";
import { diagnosisSchema, llmDiagnosisResponseSchema } from "./schema.js";

function validDiagnosis() {
  return {
    transactionId: "txn_00001",
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
    interventionEligibility: ["RETRY"],
    explanation: "Card issuer declined the charge.",
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

describe("diagnosisSchema", () => {
  it("accepts a well-formed diagnosis", () => {
    expect(() => diagnosisSchema.parse(validDiagnosis())).not.toThrow();
  });

  it("rejects a missing transactionId", () => {
    const { transactionId: _drop, ...rest } = validDiagnosis();
    expect(() => diagnosisSchema.parse(rest)).toThrow();
  });

  it("rejects an unrecognized category", () => {
    const invalid = { ...validDiagnosis(), category: "fraudulent_activity" };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects confidence above 1", () => {
    const invalid = { ...validDiagnosis(), confidence: 1.5 };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects confidence below 0", () => {
    const invalid = { ...validDiagnosis(), confidence: -0.1 };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects an empty evidence array", () => {
    const invalid = { ...validDiagnosis(), evidence: [] };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects an unrecognized intervention type", () => {
    const invalid = {
      ...validDiagnosis(),
      interventionEligibility: ["SEND_MONEY_DIRECTLY"],
    };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects an evidence item with an out-of-range weight", () => {
    const invalid = {
      ...validDiagnosis(),
      evidence: [
        {
          id: "evidence-failure-code",
          type: "transaction",
          source: "deterministic_engine:failure_classifier",
          fact: "Failure classified as issuer_decline.",
          relevance: "Explains why the payment failed.",
          weight: 2,
        },
      ],
    };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });

  it("rejects an unrecognized recoverabilityAssessment", () => {
    const invalid = { ...validDiagnosis(), recoverabilityAssessment: "DEFINITELY_RECOVERABLE" };
    expect(() => diagnosisSchema.parse(invalid)).toThrow();
  });
});

describe("llmDiagnosisResponseSchema", () => {
  it("accepts a well-formed response referencing evidence by id", () => {
    const response = {
      transactionId: "txn_00001",
      category: "issuer_decline",
      confidence: 0.6,
      evidenceIds: ["evidence-failure-code"],
      recoverabilityAssessment: "LIKELY_RECOVERABLE",
      retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "retryable" },
      interventionEligibility: ["RETRY"],
      explanation: "Card issuer declined the charge.",
      limitations: [],
    };
    expect(() => llmDiagnosisResponseSchema.parse(response)).not.toThrow();
  });

  it("rejects a response with no cited evidence ids", () => {
    const response = {
      transactionId: "txn_00001",
      category: "issuer_decline",
      confidence: 0.6,
      evidenceIds: [],
      recoverabilityAssessment: "LIKELY_RECOVERABLE",
      retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "retryable" },
      interventionEligibility: ["RETRY"],
      explanation: "Card issuer declined the charge.",
      limitations: [],
    };
    expect(() => llmDiagnosisResponseSchema.parse(response)).toThrow();
  });
});
