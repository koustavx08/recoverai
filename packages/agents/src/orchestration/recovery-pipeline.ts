import type { FailureReasonCode, Money, RecoveryOutcome, RiskPriority } from "@recoverai/core";
import type {
  AgentContext,
  DetectionAgent,
  DetectionOutcome,
  DiagnosisAgent,
  DiagnosisOutcome,
  PrioritizationAgent,
  PrioritizationOutcome,
  RecoveryAgent,
  RecoveryExecutionOutcome,
  RecoveryVerificationOutcome,
  StrategyAgent,
  StrategyOutcome,
  VerificationAgent,
} from "../agents/index.js";
import type { Diagnosis } from "../diagnosis/schema.js";
import type { DiagnosisInput } from "../diagnosis/types.js";
import type { DetectionInput } from "../detection/types.js";
import type { PrioritizationInput } from "../prioritization/types.js";
import type { StrategyDecision } from "../strategy/schema.js";
import type { StrategyInput } from "../strategy/types.js";
import type { RecoveryExecutionRequest } from "../recovery/types.js";
import type { PipelineResult, PipelineStatus, PipelineTransactionFacts } from "./pipeline-types.js";

export interface RecoveryPipelineAgents {
  readonly detection: DetectionAgent;
  readonly diagnosis: DiagnosisAgent;
  readonly prioritization: PrioritizationAgent;
  readonly strategy: StrategyAgent;
  readonly recovery: RecoveryAgent;
  readonly verification: VerificationAgent;
}

interface FailureContext {
  readonly failureCode: FailureReasonCode;
  readonly failureDescription: string;
  readonly retryable: boolean;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly expectedRecoveryAmount: Money;
  readonly priority: RiskPriority;
}

/** A caller-contract violation, not a business outcome: Detection said `actionable: true`, which only makes sense for a failed/abandoned transaction the caller has already classified and risk-scored. */
function requireFailureContext(facts: PipelineTransactionFacts): FailureContext {
  if (
    facts.failureCode === undefined ||
    facts.retryable === undefined ||
    facts.riskScore === undefined ||
    facts.recoverabilityScore === undefined ||
    facts.expectedRecoveryAmount === undefined ||
    facts.priority === undefined
  ) {
    throw new Error(
      `PipelineTransactionFacts for transaction "${facts.transactionId}" is missing required failure/risk context. ` +
        "The caller must run classification and risk-scoring before an actionable transaction reaches Diagnosis.",
    );
  }
  return {
    failureCode: facts.failureCode,
    failureDescription: facts.failureDescription ?? "",
    retryable: facts.retryable,
    riskScore: facts.riskScore,
    recoverabilityScore: facts.recoverabilityScore,
    expectedRecoveryAmount: facts.expectedRecoveryAmount,
    priority: facts.priority,
  };
}

function deriveStatus(outcome: RecoveryOutcome, verified: boolean): PipelineStatus {
  if (!verified) return "failed";
  if (outcome === "blocked" || outcome === "pending") return "blocked";
  if (outcome === "not_executed") return "skipped";
  return "completed";
}

/**
 * Orchestrates the full six-stage agent pipeline:
 *
 *   detect -> [prioritize -> diagnose -> selectStrategy -> executeRecovery -> verifyRecovery]
 *
 * (the bracketed stages only run once Detection marks a transaction
 * `actionable`). This class contains no reasoning of its own — every
 * decision comes from the injected agent implementations; the pipeline
 * only threads each stage's typed output into the next stage's typed
 * input, tracks stage-level outcomes, and derives an overall
 * `PipelineStatus`. It never throws for an expected business outcome
 * (non-retryable, retry limit, manual_review, verification failure, an
 * unexpected internal error) — every one of those becomes a `PipelineResult`
 * with an explanatory `status`/`statusReason` instead.
 */
export class RecoveryPipeline {
  constructor(
    private readonly agents: RecoveryPipelineAgents,
    private readonly context: AgentContext,
  ) {}

  async run(facts: PipelineTransactionFacts): Promise<PipelineResult> {
    const startedAt = Date.now();

    const detectionOutcome = await this.agents.detection.detect(this.toDetectionInput(facts), this.context);

    if (!detectionOutcome.result.detected) {
      return this.finish(facts, "skipped", detectionOutcome.result.reason, { detection: detectionOutcome }, startedAt);
    }
    if (!detectionOutcome.result.actionable) {
      return this.finish(facts, "blocked", detectionOutcome.result.reason, { detection: detectionOutcome }, startedAt);
    }

    let prioritizationOutcome: PrioritizationOutcome | undefined;
    let diagnosisOutcome: DiagnosisOutcome | undefined;
    let strategyOutcome: StrategyOutcome | undefined;
    let executionOutcome: RecoveryExecutionOutcome | undefined;

    try {
      const failureContext = requireFailureContext(facts);

      prioritizationOutcome = await this.agents.prioritization.prioritize(
        this.toPrioritizationInput(facts, failureContext),
        this.context,
      );

      diagnosisOutcome = await this.agents.diagnosis.diagnose(
        this.toDiagnosisInput(facts, failureContext),
        this.context,
      );

      strategyOutcome = await this.agents.strategy.selectStrategy(
        this.toStrategyInput(facts, failureContext, diagnosisOutcome.diagnosis, prioritizationOutcome.result.priority),
        this.context,
      );

      executionOutcome = await this.agents.recovery.executeRecovery(
        this.toRecoveryExecutionRequest(facts, diagnosisOutcome.diagnosis, strategyOutcome.decision),
        this.context,
      );

      const verificationOutcome = await this.agents.verification.verifyRecovery(
        executionOutcome.result,
        this.context,
      );

      const status = deriveStatus(executionOutcome.result.outcome, verificationOutcome.verification.verified);
      const statusReason =
        status === "blocked"
          ? (executionOutcome.result.blockedReason ??
            (executionOutcome.result.outcome === "pending"
              ? "Awaiting human approval — no automated approval mechanism exists yet."
              : undefined))
          : status === "skipped"
            ? "Strategy required no action."
            : status === "failed"
              ? `Verification failed: ${verificationOutcome.verification.reasons.join("; ")}`
              : undefined;

      return this.finish(
        facts,
        status,
        statusReason,
        {
          detection: detectionOutcome,
          prioritization: prioritizationOutcome,
          diagnosis: diagnosisOutcome,
          strategy: strategyOutcome,
          execution: executionOutcome,
          verification: verificationOutcome,
        },
        startedAt,
      );
    } catch (error) {
      // Never propagate an exception out of run() — a single transaction's
      // internal failure must not be able to take down a batch of others.
      const reason = error instanceof Error ? error.message : String(error);
      this.context.logger.log("error", "recovery pipeline: stage failed", {
        transactionId: facts.transactionId,
        reason,
      });
      return this.finish(
        facts,
        "failed",
        reason,
        { detection: detectionOutcome, prioritization: prioritizationOutcome, diagnosis: diagnosisOutcome, strategy: strategyOutcome, execution: executionOutcome },
        startedAt,
      );
    }
  }

  private toDetectionInput(facts: PipelineTransactionFacts): DetectionInput {
    return {
      transactionId: facts.transactionId,
      status: facts.status,
      amount: facts.amount,
      attemptCount: facts.attemptCount,
      failureCode: facts.failureCode,
      retryable: facts.retryable,
    };
  }

  private toPrioritizationInput(
    facts: PipelineTransactionFacts,
    failureContext: FailureContext,
  ): PrioritizationInput {
    return {
      transactionId: facts.transactionId,
      amount: facts.amount,
      riskScore: failureContext.riskScore,
      recoverabilityScore: failureContext.recoverabilityScore,
      expectedRecoveryAmount: failureContext.expectedRecoveryAmount,
      priority: failureContext.priority,
      retryable: failureContext.retryable,
      attemptCount: facts.attemptCount,
      customerHistory: facts.customerHistory,
    };
  }

  private toDiagnosisInput(facts: PipelineTransactionFacts, failureContext: FailureContext): DiagnosisInput {
    return {
      transactionId: facts.transactionId,
      amount: facts.amount,
      paymentMethod: facts.paymentMethod,
      transactionStatus: facts.status,
      attemptCount: facts.attemptCount,
      failureCode: failureContext.failureCode,
      failureDescription: failureContext.failureDescription,
      retryable: failureContext.retryable,
      riskScore: failureContext.riskScore,
      recoverabilityScore: failureContext.recoverabilityScore,
      expectedRecoveryAmount: failureContext.expectedRecoveryAmount,
      customerHistory: facts.customerHistory,
    };
  }

  private toStrategyInput(
    facts: PipelineTransactionFacts,
    failureContext: FailureContext,
    diagnosis: Diagnosis,
    priority: RiskPriority,
  ): StrategyInput {
    return {
      transactionId: facts.transactionId,
      diagnosis,
      amount: facts.amount,
      riskScore: failureContext.riskScore,
      recoverabilityScore: failureContext.recoverabilityScore,
      expectedRecoveryAmount: failureContext.expectedRecoveryAmount,
      priority,
      attemptCount: facts.attemptCount,
      retryable: failureContext.retryable,
      hasSucceededWithAlternateMethod: facts.hasSucceededWithAlternateMethod,
    };
  }

  private toRecoveryExecutionRequest(
    facts: PipelineTransactionFacts,
    diagnosis: Diagnosis,
    strategyDecision: StrategyDecision,
  ): RecoveryExecutionRequest {
    return {
      transactionId: facts.transactionId,
      amount: facts.amount,
      paymentMethod: facts.paymentMethod,
      attemptCount: facts.attemptCount,
      diagnosis,
      strategyDecision,
      expectedRecoveryAmount: facts.expectedRecoveryAmount ?? facts.amount,
      hasSucceededWithAlternateMethod: facts.hasSucceededWithAlternateMethod,
      executionContext: { simulationMode: true, seed: facts.seed },
    };
  }

  private finish(
    facts: PipelineTransactionFacts,
    status: PipelineStatus,
    statusReason: string | undefined,
    stages: {
      readonly detection?: DetectionOutcome;
      readonly prioritization?: PrioritizationOutcome;
      readonly diagnosis?: DiagnosisOutcome;
      readonly strategy?: StrategyOutcome;
      readonly execution?: RecoveryExecutionOutcome;
      readonly verification?: RecoveryVerificationOutcome;
    },
    startedAt: number,
  ): PipelineResult {
    const completedAt = new Date();
    return {
      transactionId: facts.transactionId,
      status,
      statusReason,
      ...stages,
      metadata: {
        startedAt: new Date(startedAt).toISOString(),
        completedAt: completedAt.toISOString(),
        totalLatencyMs: Date.now() - startedAt,
      },
    };
  }
}
