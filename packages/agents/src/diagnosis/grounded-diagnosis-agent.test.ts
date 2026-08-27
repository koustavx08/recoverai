import { describe, expect, it, vi } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import type {
  AIModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "@recoverai/integrations";
import { GroundedDiagnosisAgent } from "./grounded-diagnosis-agent.js";
import type { DiagnosisInput } from "./types.js";

const noopLogger: Logger = { log: () => {} };

const INPUT: DiagnosisInput = {
  transactionId: brand("txn_00123"),
  amount: { amount: 25_000, currency: "INR" },
  paymentMethod: "card",
  transactionStatus: "failed",
  attemptCount: 1,
  failureCode: "issuer_decline",
  failureDescription: "The card issuer declined the transaction.",
  retryable: true,
  customerHistory: { totalTransactions: 4, successfulTransactions: 3, reliabilityScore: 0.75 },
  riskScore: 50,
  recoverabilityScore: 60,
};

/**
 * Mimics a real `AIModelProvider`: it validates the raw payload against the
 * caller's own schema (as `AnthropicProvider` does via `schema.parse`)
 * rather than trusting it — so tests can exercise "the model returned
 * something invalid" by handing back a bad raw payload, without touching a
 * real API. Never makes a network call.
 */
class MockAIModelProvider implements AIModelProvider {
  readonly name = "mock-provider";
  constructor(
    private readonly behavior:
      | { readonly kind: "respond"; readonly raw: unknown }
      | { readonly kind: "throw"; readonly error: Error },
  ) {}

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    if (this.behavior.kind === "throw") throw this.behavior.error;
    const data = request.schema.parse(this.behavior.raw);
    return {
      data,
      model: "mock-model-v1",
      usage: { inputTokens: 120, outputTokens: 80 },
      latencyMs: 5,
    };
  }
}

function validRawResponse(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "txn_00123",
    category: "issuer_decline",
    confidence: 0.72,
    evidenceIds: ["evidence-failure-code", "evidence-customer-history"],
    recoverabilityAssessment: "LIKELY_RECOVERABLE",
    retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "retryable issuer decline" },
    interventionEligibility: ["ALTERNATE_PAYMENT_METHOD", "RECOVERY_LINK"],
    explanation: "The issuer declined the charge and the customer has a reliable history.",
    limitations: [],
    ...overrides,
  };
}

describe("GroundedDiagnosisAgent", () => {
  it("runs deterministically when no provider is configured", async () => {
    const agent = new GroundedDiagnosisAgent({ provider: null });
    const outcome = await agent.diagnose(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(true);
    expect(outcome.diagnosis.metadata.mode).toBe("deterministic");
    expect(outcome.diagnosis.metadata.provider).toBeNull();
  });

  it("returns an LLM-mode diagnosis for a valid, grounded structured response", async () => {
    const provider = new MockAIModelProvider({ kind: "respond", raw: validRawResponse() });
    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("llm");
    expect(outcome.meta.fallbackUsed).toBe(false);
    expect(outcome.meta.validationSuccess).toBe(true);
    expect(outcome.meta.provider).toBe("mock-provider");
    expect(outcome.meta.model).toBe("mock-model-v1");
    expect(outcome.meta.inputTokens).toBe(120);
    expect(outcome.meta.outputTokens).toBe(80);
    expect(outcome.diagnosis.metadata.mode).toBe("llm");
    expect(outcome.diagnosis.category).toBe("issuer_decline");
    expect(outcome.diagnosis.evidence.map((e) => e.id)).toEqual([
      "evidence-failure-code",
      "evidence-customer-history",
    ]);
    // Evidence content always comes from the deterministic bundle, never the model.
    expect(outcome.diagnosis.evidence[0]?.source).toContain("deterministic_engine");
  });

  it("falls back deterministically when the response fails schema validation (e.g. an invalid category)", async () => {
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({ category: "the_customer_is_lying" }),
    });
    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.diagnosis.metadata.mode).toBe("deterministic");
  });

  it("falls back deterministically when the response cites an unsupported/unknown evidence id", async () => {
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({ evidenceIds: ["evidence-i-made-this-up"] }),
    });
    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.meta.fallbackReason).toMatch(/unknown evidence/);
  });

  it("falls back deterministically when the response recommends RETRY for a non-retryable failure", async () => {
    const nonRetryableInput: DiagnosisInput = { ...INPUT, retryable: false };
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({
        interventionEligibility: ["RETRY"],
        retryRecommendation: { recommended: true, maxAttempts: 3, reasoning: "ignoring the flag" },
      }),
    });
    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(nonRetryableInput, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.diagnosis.interventionEligibility).not.toContain("RETRY");
  });

  it("falls back deterministically when the provider throws", async () => {
    const provider = new MockAIModelProvider({
      kind: "throw",
      error: new Error("network unreachable"),
    });
    const agent = new GroundedDiagnosisAgent({ provider });
    const outcome = await agent.diagnose(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.meta.fallbackReason).toMatch(/network unreachable/);
  });

  it("never calls a real network endpoint — the provider is fully substituted", async () => {
    const generateStructured = vi.fn(async () => ({
      data: validRawResponse(),
      model: "mock-model-v1",
      usage: {},
      latencyMs: 1,
    }));
    const provider: AIModelProvider = { name: "spy-provider", generateStructured: generateStructured as unknown as AIModelProvider["generateStructured"] };
    const agent = new GroundedDiagnosisAgent({ provider });
    await agent.diagnose(INPUT, { logger: noopLogger });
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });
});
