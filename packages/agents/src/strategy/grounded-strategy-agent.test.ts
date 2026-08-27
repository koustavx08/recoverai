import { describe, expect, it, vi } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import type {
  AIModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "@recoverai/integrations";
import type { Diagnosis } from "../diagnosis/schema.js";
import { GroundedStrategyAgent } from "./grounded-strategy-agent.js";
import type { StrategyInput } from "./types.js";

const noopLogger: Logger = { log: () => {} };

const DIAGNOSIS: Diagnosis = {
  transactionId: "txn_00123",
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
  transactionId: brand("txn_00123"),
  diagnosis: DIAGNOSIS,
  amount: { amount: 25_000, currency: "INR" },
  riskScore: 50,
  recoverabilityScore: 60,
  expectedRecoveryAmount: { amount: 15_000, currency: "INR" },
  priority: "medium",
  attemptCount: 1,
  retryable: true,
};

/**
 * Mimics a real `AIModelProvider`: validates the raw payload against the
 * caller's own schema (as `AnthropicProvider` does via `schema.parse`)
 * rather than trusting it, so tests can exercise "the model returned
 * something invalid" without touching a real API.
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
      usage: { inputTokens: 100, outputTokens: 60 },
      latencyMs: 4,
    };
  }
}

function validRawResponse(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "txn_00123",
    strategy: "switch_payment_method",
    confidence: 0.75,
    rationale: "Issuer decline; customer has an alternate payment method on file.",
    evidenceIds: ["evidence-failure-code"],
    expectedOutcome: "May improve the odds of recovering this transaction; not a guarantee.",
    limitations: [],
    ...overrides,
  };
}

describe("GroundedStrategyAgent", () => {
  it("runs deterministically when no provider is configured", async () => {
    const agent = new GroundedStrategyAgent({ provider: null });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(true);
    expect(outcome.decision.metadata.mode).toBe("deterministic");
    expect(outcome.decision.metadata.provider).toBeNull();
  });

  it("returns an LLM-mode decision for a valid, grounded, policy-approved response", async () => {
    const provider = new MockAIModelProvider({ kind: "respond", raw: validRawResponse() });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("llm");
    expect(outcome.meta.fallbackUsed).toBe(false);
    expect(outcome.meta.validationSuccess).toBe(true);
    expect(outcome.meta.provider).toBe("mock-provider");
    expect(outcome.meta.model).toBe("mock-model-v1");
    expect(outcome.decision.metadata.mode).toBe("llm");
    expect(outcome.decision.strategy).toBe("switch_payment_method");
    expect(outcome.decision.supportingEvidence.map((e) => e.id)).toEqual(["evidence-failure-code"]);
    expect(outcome.decision.supportingEvidence[0]?.source).toContain("deterministic_engine");
    // requiresHumanApproval is always deterministically computed, never trusted from the model.
    expect(outcome.decision.requiresHumanApproval).toBe(false);
  });

  it("falls back deterministically when the response fails schema validation (invalid strategy)", async () => {
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({ strategy: "refund_the_customer_immediately" }),
    });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(false);
  });

  it("falls back deterministically when the response selects a strategy outside the policy-approved set", async () => {
    const provider = new MockAIModelProvider({
      kind: "respond",
      // "send_payment_link" is schema-valid but not policy-approved for issuer_decline.
      raw: validRawResponse({ strategy: "send_payment_link" }),
    });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.meta.fallbackReason).toMatch(/not policy-approved/);
  });

  it("falls back deterministically when the response cites an unknown evidence id", async () => {
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({ evidenceIds: ["evidence-invented"] }),
    });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.meta.fallbackReason).toMatch(/unknown evidence/);
  });

  it("falls back deterministically when the provider throws", async () => {
    const provider = new MockAIModelProvider({
      kind: "throw",
      error: new Error("network unreachable"),
    });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(INPUT, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.meta.fallbackUsed).toBe(true);
    expect(outcome.meta.validationSuccess).toBe(false);
    expect(outcome.meta.fallbackReason).toMatch(/network unreachable/);
  });

  it("falls back deterministically for a non-retryable failure even if the model tries to recommend a retry-based strategy", async () => {
    const nonRetryableInput: StrategyInput = {
      ...INPUT,
      diagnosis: { ...DIAGNOSIS, category: "non_retryable" },
      retryable: false,
    };
    const provider = new MockAIModelProvider({
      kind: "respond",
      raw: validRawResponse({ strategy: "retry_payment" }),
    });
    const agent = new GroundedStrategyAgent({ provider });
    const outcome = await agent.selectStrategy(nonRetryableInput, { logger: noopLogger });

    expect(outcome.meta.mode).toBe("deterministic");
    expect(outcome.decision.strategy).not.toBe("retry_payment");
  });

  it("never calls a real network endpoint — the provider is fully substituted", async () => {
    const generateStructured = vi.fn(async () => ({
      data: validRawResponse(),
      model: "mock-model-v1",
      usage: {},
      latencyMs: 1,
    }));
    const provider: AIModelProvider = {
      name: "spy-provider",
      generateStructured: generateStructured as unknown as AIModelProvider["generateStructured"],
    };
    const agent = new GroundedStrategyAgent({ provider });
    await agent.selectStrategy(INPUT, { logger: noopLogger });
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });
});
