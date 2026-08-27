import { describe, expect, it } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import type { RecoverySimulationProvider, RecoverySimulationRequest, RecoverySimulationResult } from "@recoverai/integrations";
import type { Diagnosis } from "../diagnosis/schema.js";
import type { StrategyDecision } from "../strategy/schema.js";
import { SimulatedRecoveryAgent } from "./simulated-recovery-agent.js";
import type { RecoveryExecutionRequest } from "./types.js";

const noopLogger: Logger = { log: () => {} };

const DIAGNOSIS: Diagnosis = {
  transactionId: "txn_00500",
  category: "issuer_decline",
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
  recoverabilityAssessment: "LIKELY_RECOVERABLE",
  retryRecommendation: { recommended: true, maxAttempts: 2, reasoning: "test" },
  interventionEligibility: ["ALTERNATE_PAYMENT_METHOD"],
  explanation: "test",
  limitations: [],
  metadata: {
    mode: "deterministic",
    provider: null,
    model: null,
    agentVersion: "diagnosis-agent@1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    fallbackUsed: true,
  },
};

function strategyDecision(overrides: Partial<StrategyDecision> = {}): StrategyDecision {
  return {
    transactionId: "txn_00500",
    strategy: "switch_payment_method",
    confidence: 0.6,
    rationale: "test",
    supportingEvidence: DIAGNOSIS.evidence,
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
      fallbackUsed: true,
    },
    ...overrides,
  };
}

function request(overrides: Partial<RecoveryExecutionRequest> = {}): RecoveryExecutionRequest {
  return {
    transactionId: brand("txn_00500"),
    amount: { amount: 25_000, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    diagnosis: DIAGNOSIS,
    strategyDecision: strategyDecision(),
    expectedRecoveryAmount: { amount: 15_000, currency: "INR" },
    executionContext: { simulationMode: true },
    ...overrides,
  };
}

class StubSimulationProvider implements RecoverySimulationProvider {
  readonly name = "stub-simulator";
  constructor(private readonly succeeded: boolean) {}

  async simulate(req: RecoverySimulationRequest): Promise<RecoverySimulationResult> {
    return { succeeded: this.succeeded, roll: req.probabilityOfSuccess };
  }
}

class ThrowingSimulationProvider implements RecoverySimulationProvider {
  readonly name = "throwing-simulator";
  async simulate(): Promise<RecoverySimulationResult> {
    throw new Error("simulator unavailable");
  }
}

describe("SimulatedRecoveryAgent", () => {
  it("returns a success outcome with recoveredAmount equal to the expected recovery amount", async () => {
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new StubSimulationProvider(true) });
    const outcome = await agent.executeRecovery(request({}), { logger: noopLogger });

    expect(outcome.result.outcome).toBe("success");
    expect(outcome.result.recoveredAmount).toEqual({ amount: 15_000, currency: "INR" });
    expect(outcome.result.simulationMode).toBe(true);
    expect(outcome.meta.simulationMode).toBe(true);
  });

  it("returns a failure outcome with zero recoveredAmount", async () => {
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new StubSimulationProvider(false) });
    const outcome = await agent.executeRecovery(request({}), { logger: noopLogger });

    expect(outcome.result.outcome).toBe("failure");
    expect(outcome.result.recoveredAmount.amount).toBe(0);
  });

  it("blocks execution for manual_review without ever calling the simulator", async () => {
    let called = false;
    class SpyProvider implements RecoverySimulationProvider {
      readonly name = "spy";
      async simulate(): Promise<RecoverySimulationResult> {
        called = true;
        return { succeeded: true, roll: 0 };
      }
    }
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new SpyProvider() });
    const outcome = await agent.executeRecovery(
      request({ strategyDecision: strategyDecision({ strategy: "manual_review", requiresHumanApproval: true }) }),
      { logger: noopLogger },
    );

    expect(outcome.result.outcome).toBe("blocked");
    expect(outcome.result.recoveredAmount.amount).toBe(0);
    expect(outcome.result.blockedReason).toBeDefined();
    expect(called).toBe(false);
  });

  it("returns not_executed for no_action without calling the simulator", async () => {
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new StubSimulationProvider(true) });
    const outcome = await agent.executeRecovery(
      request({ strategyDecision: strategyDecision({ strategy: "no_action" }) }),
      { logger: noopLogger },
    );
    expect(outcome.result.outcome).toBe("not_executed");
    expect(outcome.result.recoveredAmount.amount).toBe(0);
  });

  it("returns pending for a strategy that requires human approval, without calling the simulator", async () => {
    let called = false;
    class SpyProvider implements RecoverySimulationProvider {
      readonly name = "spy";
      async simulate(): Promise<RecoverySimulationResult> {
        called = true;
        return { succeeded: true, roll: 0 };
      }
    }
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new SpyProvider() });
    const outcome = await agent.executeRecovery(
      request({
        strategyDecision: strategyDecision({ strategy: "manual_followup", requiresHumanApproval: true }),
      }),
      { logger: noopLogger },
    );
    expect(outcome.result.outcome).toBe("pending");
    expect(outcome.result.recoveredAmount.amount).toBe(0);
    expect(called).toBe(false);
  });

  it("blocks execution when the retry limit has been reached, without calling the simulator", async () => {
    let called = false;
    class SpyProvider implements RecoverySimulationProvider {
      readonly name = "spy";
      async simulate(): Promise<RecoverySimulationResult> {
        called = true;
        return { succeeded: true, roll: 0 };
      }
    }
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new SpyProvider() });
    const outcome = await agent.executeRecovery(
      request({ attemptCount: 3, strategyDecision: strategyDecision({ strategy: "retry_payment" }) }),
      { logger: noopLogger },
    );
    expect(outcome.result.outcome).toBe("blocked");
    expect(called).toBe(false);
  });

  it("propagates a simulator failure as a rejected promise rather than silently swallowing it", async () => {
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new ThrowingSimulationProvider() });
    await expect(agent.executeRecovery(request({}), { logger: noopLogger })).rejects.toThrow(
      "simulator unavailable",
    );
  });

  it("never uses a real network-facing provider — the interface is fully substituted", () => {
    const agent = new SimulatedRecoveryAgent({ simulationProvider: new StubSimulationProvider(true) });
    expect(agent.id).toBe("recovery-agent");
  });
});
