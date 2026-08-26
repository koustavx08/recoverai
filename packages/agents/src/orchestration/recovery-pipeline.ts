import type {
  FailureReason,
  RecoveryAction,
  RecoveryResult,
  RecoveryStrategy,
  RevenueRisk,
  Transaction,
} from "@recoverai/core";
import type {
  DetectionAgent,
  DetectionResult,
  DiagnosisAgent,
  PrioritizationAgent,
  RecoveryAgent,
  StrategyAgent,
  VerificationAgent,
  AgentContext,
} from "../agents/index.js";
import { AgentNotImplementedError } from "./not-implemented.js";

export interface RecoveryPipelineAgents {
  readonly detection: DetectionAgent;
  readonly diagnosis: DiagnosisAgent;
  readonly prioritization: PrioritizationAgent;
  readonly strategy: StrategyAgent;
  readonly recovery: RecoveryAgent;
  readonly verification: VerificationAgent;
}

/**
 * Orchestrates the six-stage agent pipeline:
 *
 *   detect -> diagnose -> prioritize -> selectStrategy -> executeRecovery -> verifyRecovery
 *
 * This class only wires the stages together and is intentionally thin: all
 * actual reasoning lives in the injected agent implementations. Until real
 * agents are implemented, every method here throws `AgentNotImplementedError`.
 */
export class RecoveryPipeline {
  constructor(
    private readonly agents: RecoveryPipelineAgents,
    private readonly context: AgentContext,
  ) {}

  async analyze(transaction: Transaction): Promise<DetectionResult> {
    void transaction;
    void this.agents.detection;
    throw new AgentNotImplementedError("detection");
  }

  async diagnose(transaction: Transaction): Promise<FailureReason> {
    void transaction;
    void this.agents.diagnosis;
    throw new AgentNotImplementedError("diagnosis");
  }

  async prioritize(transaction: Transaction): Promise<RevenueRisk> {
    void transaction;
    void this.agents.prioritization;
    throw new AgentNotImplementedError("prioritization");
  }

  async selectStrategy(transaction: Transaction): Promise<RecoveryStrategy> {
    void transaction;
    void this.agents.strategy;
    throw new AgentNotImplementedError("strategy_selection");
  }

  async executeRecovery(action: RecoveryAction): Promise<RecoveryResult> {
    void action;
    void this.agents.recovery;
    throw new AgentNotImplementedError("recovery_execution");
  }

  async verifyRecovery(action: RecoveryAction): Promise<RecoveryResult> {
    void action;
    void this.agents.verification;
    throw new AgentNotImplementedError("verification");
  }

  /** Runs the full pipeline for a single transaction, end to end. */
  async run(transaction: Transaction): Promise<RecoveryResult> {
    await this.analyze(transaction);
    await this.diagnose(transaction);
    await this.prioritize(transaction);
    await this.selectStrategy(transaction);
    // Stages beyond this point require a RecoveryAction produced by
    // selectStrategy, which is not implemented yet.
    throw new AgentNotImplementedError("run");
  }
}
