import type { RecoverySimulationProvider } from "@recoverai/integrations";
import type {
  RecoveryAgent,
  RecoveryExecutionMeta,
  RecoveryExecutionOutcome,
} from "../agents/recovery-agent.js";
import type { AgentContext } from "../agents/types.js";
import {
  buildBlockedResult,
  buildNotExecutedResult,
  buildPendingResult,
  buildSimulatedResult,
} from "./deterministic-execution.js";
import { canExecute } from "./policy.js";
import { computeSimulationProfile } from "./simulation-profile.js";
import type { RecoveryExecutionRequest } from "./types.js";

export interface SimulatedRecoveryAgentOptions {
  readonly simulationProvider: RecoverySimulationProvider;
}

function buildSeed(request: RecoveryExecutionRequest, action: string): string {
  const override = request.executionContext.seed;
  return `${override ?? "default"}:${request.transactionId}:${request.strategyDecision.strategy}:${action}`;
}

/**
 * The Recovery Agent: validated StrategyDecision + transaction facts ->
 * RecoveryExecutionPolicy (the single gate — see policy.ts) -> if allowed
 * and not approval-gated, a deterministic simulation-only execution via
 * `RecoverySimulationProvider`. Every branch — blocked, not_executed,
 * pending, or simulated — produces a `RecoveryExecutionResult`; nothing is
 * silently skipped, so every attempt is auditable (Task 10).
 *
 * Safety boundary: this agent never constructs a raw external API request,
 * never bypasses `canExecute()`, never overrides `requiresHumanApproval`,
 * and never claims money was recovered — `recoveredAmount` reflects a
 * *simulated* outcome only, always alongside `simulationMode: true`.
 * Verification (a separate agent) independently re-checks the result
 * rather than trusting this agent's own report.
 */
export class SimulatedRecoveryAgent implements RecoveryAgent {
  readonly id = "recovery-agent";

  constructor(private readonly options: SimulatedRecoveryAgentOptions) {}

  async executeRecovery(
    request: RecoveryExecutionRequest,
    context: AgentContext,
  ): Promise<RecoveryExecutionOutcome> {
    const startedAt = Date.now();
    const now = new Date();
    const decision = canExecute(request);

    if (!decision.allowed) {
      context.logger.log("info", "recovery agent: execution blocked by policy", {
        transactionId: request.transactionId,
        reason: decision.blockedReason,
      });
      const result = buildBlockedResult(request, decision.executionId, decision.blockedReason, now);
      return this.finish(result, startedAt);
    }

    const { plan } = decision;

    if (plan.action === "none") {
      const result = buildNotExecutedResult(request, plan, now);
      context.logger.log("info", "recovery agent: no_action, nothing executed", {
        transactionId: request.transactionId,
      });
      return this.finish(result, startedAt);
    }

    if (plan.approvalRequired) {
      const result = buildPendingResult(request, plan, now);
      context.logger.log("info", "recovery agent: pending human approval", {
        transactionId: request.transactionId,
        strategy: plan.strategy,
      });
      return this.finish(result, startedAt);
    }

    const profile = computeSimulationProfile(request);
    const seed = buildSeed(request, plan.action);
    const simulation = await this.options.simulationProvider.simulate({
      seed,
      probabilityOfSuccess: profile.probabilityOfSuccess,
      amount: request.expectedRecoveryAmount,
    });
    const result = buildSimulatedResult(request, plan, simulation, profile, now);

    context.logger.log("info", "recovery agent: simulation completed", {
      transactionId: request.transactionId,
      strategy: plan.strategy,
      outcome: result.outcome,
      probabilityOfSuccess: profile.probabilityOfSuccess,
      simulationMode: true,
    });

    return this.finish(result, startedAt);
  }

  private finish(
    result: RecoveryExecutionOutcome["result"],
    startedAt: number,
  ): RecoveryExecutionOutcome {
    const meta: RecoveryExecutionMeta = {
      latencyMs: Date.now() - startedAt,
      simulationMode: true,
    };
    return { result, meta };
  }
}
