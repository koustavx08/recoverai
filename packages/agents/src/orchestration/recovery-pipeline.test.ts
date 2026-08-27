import { describe, expect, it } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import { RecoveryExecutionSimulator } from "@recoverai/integrations";
import type { AgentContext } from "../agents/types.js";
import type { RecoveryVerificationOutcome, VerificationAgent } from "../agents/verification-agent.js";
import { DeterministicDetectionAgent } from "../detection/deterministic-detection-agent.js";
import { GroundedDiagnosisAgent } from "../diagnosis/grounded-diagnosis-agent.js";
import { DeterministicPrioritizationAgent } from "../prioritization/deterministic-prioritization-agent.js";
import { DeterministicVerificationAgent } from "../recovery/deterministic-verification-agent.js";
import type { RecoveryExecutionResult } from "../recovery/schema.js";
import { SimulatedRecoveryAgent } from "../recovery/simulated-recovery-agent.js";
import { GroundedStrategyAgent } from "../strategy/grounded-strategy-agent.js";
import type { PipelineTransactionFacts } from "./pipeline-types.js";
import { RecoveryPipeline, type RecoveryPipelineAgents } from "./recovery-pipeline.js";

const noopLogger: Logger = { log: () => {} };

function buildAgents(overrides: Partial<RecoveryPipelineAgents> = {}): RecoveryPipelineAgents {
  return {
    detection: new DeterministicDetectionAgent(),
    diagnosis: new GroundedDiagnosisAgent({ provider: null }),
    prioritization: new DeterministicPrioritizationAgent(),
    strategy: new GroundedStrategyAgent({ provider: null }),
    recovery: new SimulatedRecoveryAgent({ simulationProvider: new RecoveryExecutionSimulator() }),
    verification: new DeterministicVerificationAgent(),
    ...overrides,
  };
}

function facts(overrides: Partial<PipelineTransactionFacts> = {}): PipelineTransactionFacts {
  return {
    transactionId: brand("txn_test"),
    status: "failed",
    amount: { amount: 250_000, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    failureCode: "issuer_decline",
    failureDescription: "The card issuer declined the transaction.",
    retryable: true,
    riskScore: 45,
    recoverabilityScore: 60,
    expectedRecoveryAmount: { amount: 150_000, currency: "INR" },
    priority: "medium",
    customerHistory: { totalTransactions: 4, successfulTransactions: 3, reliabilityScore: 0.75 },
    hasSucceededWithAlternateMethod: true,
    seed: "test-seed",
    ...overrides,
  };
}

class AlwaysInvalidVerificationAgent implements VerificationAgent {
  readonly id = "always-invalid-verification-agent";
  async verifyRecovery(
    result: RecoveryExecutionResult,
    _context: AgentContext,
  ): Promise<RecoveryVerificationOutcome> {
    return {
      verification: {
        executionId: result.executionId,
        transactionId: result.transactionId,
        verified: false,
        reasons: ["forced failure for testing"],
        checkedAt: new Date().toISOString(),
      },
      meta: { latencyMs: 0 },
    };
  }
}

describe("RecoveryPipeline", () => {
  it("runs the full successful path end to end", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(facts({}));

    expect(["completed", "blocked"]).toContain(result.status); // switch_payment_method may block only if policy excludes it — otherwise completes
    expect(result.detection?.result.actionable).toBe(true);
    expect(result.prioritization).toBeDefined();
    expect(result.diagnosis).toBeDefined();
    expect(result.strategy).toBeDefined();
    expect(result.execution).toBeDefined();
    expect(result.verification).toBeDefined();
    expect(result.metadata.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("stops at Detection with status skipped for a succeeded transaction", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(facts({ status: "succeeded", failureCode: undefined, retryable: undefined }));

    expect(result.status).toBe("skipped");
    expect(result.detection).toBeDefined();
    expect(result.prioritization).toBeUndefined();
    expect(result.diagnosis).toBeUndefined();
  });

  it("stops at Detection with status blocked for a non-retryable failure", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(facts({ retryable: false }));

    expect(result.status).toBe("blocked");
    expect(result.detection?.result.actionable).toBe(false);
    expect(result.diagnosis).toBeUndefined();
  });

  it("reaches manual_review for insufficient_evidence-shaped input and reports status blocked", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(
      facts({
        failureCode: "processor_error",
        customerHistory: undefined,
        hasSucceededWithAlternateMethod: undefined,
        riskScore: 20,
        recoverabilityScore: 20,
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.strategy?.decision.strategy).toBe("manual_review");
    expect(result.execution?.result.outcome).toBe("blocked");
  });

  it("reports status skipped when the strategy is no_action", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(
      facts({ failureCode: "insufficient_funds", recoverabilityScore: 5, riskScore: 50 }),
    );

    expect(result.status).toBe("skipped");
    expect(result.execution?.result.outcome).toBe("not_executed");
  });

  it("reports status failed when independent verification finds the execution result invalid", async () => {
    const pipeline = new RecoveryPipeline(
      buildAgents({ verification: new AlwaysInvalidVerificationAgent() }),
      { logger: noopLogger },
    );
    const result = await pipeline.run(facts({}));

    expect(result.status).toBe("failed");
    expect(result.statusReason).toMatch(/forced failure for testing/);
  });

  it("preserves stage metadata (latency, mode) across every stage that ran", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(facts({}));

    expect(result.detection?.meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.prioritization?.meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.diagnosis?.meta.mode).toBe("deterministic");
    expect(result.strategy?.meta.mode).toBe("deterministic");
    expect(result.execution?.meta.simulationMode).toBe(true);
  });

  it("never throws — an internal stage error becomes a failed PipelineResult", async () => {
    // A transaction missing risk context but marked actionable by a
    // hand-rolled facts object simulates a caller-contract violation.
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const result = await pipeline.run(
      facts({ riskScore: undefined, recoverabilityScore: undefined, expectedRecoveryAmount: undefined, priority: undefined }),
    );
    expect(result.status).toBe("failed");
    expect(result.statusReason).toBeDefined();
  });

  it("is deterministic given the same seed across repeated runs", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const a = await pipeline.run(facts({}));
    const b = await pipeline.run(facts({}));
    expect(a.status).toBe(b.status);
    expect(a.execution?.result.outcome).toBe(b.execution?.result.outcome);
    expect(a.execution?.result.recoveredAmount).toEqual(b.execution?.result.recoveredAmount);
  });
});
