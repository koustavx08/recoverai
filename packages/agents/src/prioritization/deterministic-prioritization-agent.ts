import type { PrioritizationAgent, PrioritizationOutcome } from "../agents/prioritization-agent.js";
import type { AgentContext } from "../agents/types.js";
import { prioritizeTransaction } from "./deterministic-prioritization.js";
import type { PrioritizationInput } from "./types.js";

/**
 * The Prioritization Agent: deterministically packages the already-computed
 * risk/recoverability signal into an explainable, bounded
 * `PrioritizationResult`. No model involved, and no re-derivation of the
 * underlying risk score — see `deterministic-prioritization.ts`.
 */
export class DeterministicPrioritizationAgent implements PrioritizationAgent {
  readonly id = "prioritization-agent";

  async prioritize(input: PrioritizationInput, context: AgentContext): Promise<PrioritizationOutcome> {
    const startedAt = Date.now();
    const result = prioritizeTransaction(input);

    context.logger.log("info", "prioritization agent: evaluated transaction", {
      transactionId: input.transactionId,
      priority: result.priority,
      score: result.score,
    });

    return { result, meta: { latencyMs: Date.now() - startedAt } };
  }
}
