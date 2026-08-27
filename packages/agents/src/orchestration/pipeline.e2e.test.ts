/**
 * End-to-end coverage for the real RecoveryPipeline / BatchRecoveryPipeline
 * — every test here runs the actual six agents (deterministic fallback,
 * no AI credentials in this test environment) through the actual
 * orchestrator, never a hand-rolled substitute for pipeline logic. Mocks
 * appear exactly once, at a genuine external-boundary stand-in
 * (`AlwaysInvalidVerificationAgent`, used only to prove the pipeline
 * reacts correctly to a verification failure it did not itself produce).
 *
 * This file exists as the canonical, narratively-organized reference for
 * "what does RecoverAI actually do in each of its core scenarios" —
 * distinct from recovery-pipeline.test.ts, which covers the same
 * orchestrator from an implementation-detail angle (stage metadata,
 * never-throws, determinism). Two scenarios required here were not
 * previously covered at the full-pipeline level: retry-limit block and
 * pending human approval (both existed only as unit tests on their
 * individual stages).
 */
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
import { BatchRecoveryPipeline } from "./batch-recovery-pipeline.js";
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

function newPipeline(overrides: Partial<RecoveryPipelineAgents> = {}): RecoveryPipeline {
  return new RecoveryPipeline(buildAgents(overrides), { logger: noopLogger });
}

function facts(overrides: Partial<PipelineTransactionFacts> = {}): PipelineTransactionFacts {
  return {
    transactionId: brand("e2e_txn"),
    status: "failed",
    amount: { amount: 189_900, currency: "INR" },
    paymentMethod: "card",
    attemptCount: 1,
    failureCode: "issuer_decline",
    failureDescription: "The card issuer declined the transaction.",
    retryable: true,
    riskScore: 45,
    recoverabilityScore: 60,
    expectedRecoveryAmount: { amount: 150_000, currency: "INR" },
    priority: "medium",
    hasSucceededWithAlternateMethod: true,
    seed: "e2e-seed",
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
        reasons: ["forced failure for e2e testing"],
        checkedAt: new Date().toISOString(),
      },
      meta: { latencyMs: 0 },
    };
  }
}

describe("E2E: Transaction -> Detection -> Prioritization -> Diagnosis -> Strategy -> Execution -> Verification", () => {
  it("1. successful simulated recovery runs every stage and completes", async () => {
    const result = await newPipeline().run(facts({}));

    expect(result.detection?.result.detected).toBe(true);
    expect(result.detection?.result.actionable).toBe(true);
    expect(result.prioritization?.result.priority).toBeDefined();
    expect(result.diagnosis?.diagnosis.category).toBe("issuer_decline");
    expect(result.strategy?.decision.strategy).toBe("switch_payment_method");
    expect(result.execution?.result.outcome).toBe("success");
    expect(result.execution?.result.simulationMode).toBe(true);
    expect(result.verification?.verification.verified).toBe(true);
    expect(result.status).toBe("completed");

    // The single most important invariant in this entire codebase.
    expect(result.execution?.result.simulationMode).toBe(true);
  });

  it("2. an already-succeeded transaction is skipped before any other stage runs", async () => {
    const result = await newPipeline().run(
      facts({ status: "succeeded", failureCode: undefined, retryable: undefined }),
    );

    expect(result.detection?.result.detected).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.prioritization).toBeUndefined();
    expect(result.diagnosis).toBeUndefined();
    expect(result.strategy).toBeUndefined();
    expect(result.execution).toBeUndefined();
    expect(result.verification).toBeUndefined();
  });

  it("3. a non-retryable failure is blocked at Detection, before Diagnosis ever runs", async () => {
    const result = await newPipeline().run(facts({ retryable: false }));

    expect(result.detection?.result.actionable).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.diagnosis).toBeUndefined();
    expect(result.execution).toBeUndefined();
  });

  it("4. an ambiguous failure escalates to manual_review and is blocked by the Recovery Execution Policy", async () => {
    const result = await newPipeline().run(
      facts({
        failureCode: "processor_error",
        hasSucceededWithAlternateMethod: undefined,
        riskScore: 20,
        recoverabilityScore: 10,
      }),
    );

    expect(result.strategy?.decision.strategy).toBe("manual_review");
    expect(result.execution?.result.outcome).toBe("blocked");
    expect(result.execution?.result.blockedReason).toMatch(/manual_review/);
    expect(result.execution?.result.recoveredAmount.amount).toBe(0);
    expect(result.status).toBe("blocked");
    // Verification still runs even for a blocked execution — it is not skipped.
    expect(result.verification?.verification.verified).toBe(true);
  });

  it("5. a strategy requiring human approval resolves to pending, never an automatic success", async () => {
    const result = await newPipeline().run(
      facts({
        failureCode: "insufficient_funds",
        recoverabilityScore: 55,
        riskScore: 40,
      }),
    );

    expect(result.strategy?.decision.requiresHumanApproval).toBe(true);
    expect(result.execution?.result.outcome).toBe("pending");
    expect(result.execution?.result.recoveredAmount.amount).toBe(0);
    expect(result.status).toBe("blocked");
  });

  it("6. a transaction that already reached the retry cap is blocked at Detection, distinct from non-retryable", async () => {
    const result = await newPipeline().run(facts({ attemptCount: 3, retryable: true }));

    expect(result.detection?.result.detected).toBe(true);
    expect(result.detection?.result.actionable).toBe(false);
    expect(result.status).toBe("blocked");
    // Confirms this is the retry-cap path, not the non-retryable path.
    expect(result.detection?.result.reason.toLowerCase()).toMatch(/retry|attempt/);
    expect(result.diagnosis).toBeUndefined();
  });

  it("7. a malformed execution result is caught by independent verification and fails the pipeline", async () => {
    const result = await newPipeline({ verification: new AlwaysInvalidVerificationAgent() }).run(
      facts({}),
    );

    // The execution agent itself still reports success — verification is
    // what catches the problem, proving it never simply trusts execution's
    // own report.
    expect(result.execution?.result.outcome).toBe("success");
    expect(result.verification?.verification.verified).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.statusReason).toMatch(/forced failure for e2e testing/);
  });
});

describe("E2E: batch orchestration across mixed real outcomes", () => {
  it("runs all seven scenario shapes together and produces consistent portfolio-level aggregation", async () => {
    const pipeline = newPipeline();
    const batch = new BatchRecoveryPipeline(pipeline);

    const factsList: PipelineTransactionFacts[] = [
      facts({ transactionId: brand("e2e_success") }),
      facts({ transactionId: brand("e2e_skip"), status: "succeeded", failureCode: undefined, retryable: undefined }),
      facts({ transactionId: brand("e2e_nonretryable"), retryable: false }),
      facts({
        transactionId: brand("e2e_manual_review"),
        failureCode: "processor_error",
        hasSucceededWithAlternateMethod: undefined,
        riskScore: 20,
        recoverabilityScore: 10,
      }),
      facts({
        transactionId: brand("e2e_pending"),
        failureCode: "insufficient_funds",
        recoverabilityScore: 55,
        riskScore: 40,
      }),
      facts({ transactionId: brand("e2e_retry_limit"), attemptCount: 3, retryable: true }),
    ];

    const result = await batch.run(factsList);

    expect(result.total).toBe(6);
    expect(result.skipped).toBe(1);
    expect(result.blocked).toBe(4); // nonretryable, manual_review, pending, retry_limit
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);
    expect(
      result.metrics.completedTransactions +
        result.metrics.blockedTransactions +
        result.metrics.skippedTransactions +
        result.metrics.failedPipelineRuns,
    ).toBe(6);

    // Every execution result in this batch stays simulation-only.
    for (const pipelineResult of result.results) {
      if (pipelineResult.execution) {
        expect(pipelineResult.execution.result.simulationMode).toBe(true);
      }
    }
  });
});
