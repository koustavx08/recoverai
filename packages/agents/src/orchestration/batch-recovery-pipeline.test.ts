import { describe, expect, it } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import { RecoveryExecutionSimulator } from "@recoverai/integrations";
import { DeterministicDetectionAgent } from "../detection/deterministic-detection-agent.js";
import { GroundedDiagnosisAgent } from "../diagnosis/grounded-diagnosis-agent.js";
import { DeterministicPrioritizationAgent } from "../prioritization/deterministic-prioritization-agent.js";
import { DeterministicVerificationAgent } from "../recovery/deterministic-verification-agent.js";
import { SimulatedRecoveryAgent } from "../recovery/simulated-recovery-agent.js";
import { GroundedStrategyAgent } from "../strategy/grounded-strategy-agent.js";
import { BatchRecoveryPipeline } from "./batch-recovery-pipeline.js";
import type { PipelineTransactionFacts } from "./pipeline-types.js";
import { RecoveryPipeline, type RecoveryPipelineAgents } from "./recovery-pipeline.js";

const noopLogger: Logger = { log: () => {} };

function buildAgents(): RecoveryPipelineAgents {
  return {
    detection: new DeterministicDetectionAgent(),
    diagnosis: new GroundedDiagnosisAgent({ provider: null }),
    prioritization: new DeterministicPrioritizationAgent(),
    strategy: new GroundedStrategyAgent({ provider: null }),
    recovery: new SimulatedRecoveryAgent({ simulationProvider: new RecoveryExecutionSimulator() }),
    verification: new DeterministicVerificationAgent(),
  };
}

function facts(id: string, overrides: Partial<PipelineTransactionFacts> = {}): PipelineTransactionFacts {
  return {
    transactionId: brand(id),
    status: "failed",
    amount: { amount: 100_000, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    failureCode: "issuer_decline",
    failureDescription: "The card issuer declined the transaction.",
    retryable: true,
    riskScore: 45,
    recoverabilityScore: 55,
    expectedRecoveryAmount: { amount: 55_000, currency: "INR" },
    priority: "medium",
    seed: `seed-${id}`,
    ...overrides,
  };
}

describe("BatchRecoveryPipeline", () => {
  it("runs multiple transactions and aggregates status counts", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const batch = new BatchRecoveryPipeline(pipeline);

    const factsList = [
      facts("txn_a", { status: "succeeded", failureCode: undefined, retryable: undefined }), // skipped
      facts("txn_b", { retryable: false }), // blocked
      facts("txn_c", {}), // completed (or blocked, depending on strategy — both are valid non-skip outcomes)
    ];

    const result = await batch.run(factsList);

    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.blocked).toBeGreaterThanOrEqual(1);
    expect(result.completed + result.blocked + result.skipped + result.failed).toBe(3);
  });

  it("produces mixed outcomes across a realistic batch and matches the metrics totals", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const batch = new BatchRecoveryPipeline(pipeline);

    const factsList = [
      facts("txn_1", {}),
      facts("txn_2", { failureCode: "insufficient_funds" }),
      facts("txn_3", { status: "succeeded", failureCode: undefined, retryable: undefined }),
      facts("txn_4", { retryable: false }),
      facts("txn_5", { failureCode: "network_timeout" }),
    ];

    const result = await batch.run(factsList);

    expect(result.metrics.totalTransactions).toBe(5);
    expect(
      result.metrics.completedTransactions +
        result.metrics.blockedTransactions +
        result.metrics.skippedTransactions +
        result.metrics.failedPipelineRuns,
    ).toBe(5);
    expect(result.metrics.revenueAtRisk.amount).toBeGreaterThan(0);
  });

  it("is deterministic given the same facts and seeds across repeated runs", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const batch = new BatchRecoveryPipeline(pipeline);
    const factsList = [facts("txn_1", {}), facts("txn_2", { failureCode: "upi_failure" })];

    const a = await batch.run(factsList);
    const b = await batch.run(factsList);

    expect(a.results.map((r) => r.status)).toEqual(b.results.map((r) => r.status));
    expect(a.metrics.simulatedRecoveredAmount).toEqual(b.metrics.simulatedRecoveredAmount);
  });

  it("computes a simulation recovery rate consistent with revenueAtRisk and simulatedRecoveredAmount", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const batch = new BatchRecoveryPipeline(pipeline);
    const result = await batch.run([facts("txn_1", {})]);

    const { revenueAtRisk, simulatedRecoveredAmount, simulationRecoveryRate } = result.metrics;
    if (revenueAtRisk.amount > 0) {
      expect(simulationRecoveryRate).toBeCloseTo((simulatedRecoveredAmount.amount / revenueAtRisk.amount) * 100, 5);
    } else {
      expect(simulationRecoveryRate).toBe(0);
    }
  });

  it("never causes a real external payment call — every result stays simulation-only", async () => {
    const pipeline = new RecoveryPipeline(buildAgents(), { logger: noopLogger });
    const batch = new BatchRecoveryPipeline(pipeline);
    const result = await batch.run([facts("txn_1", {})]);

    for (const pipelineResult of result.results) {
      if (pipelineResult.execution) {
        expect(pipelineResult.execution.result.simulationMode).toBe(true);
      }
    }
  });
});
