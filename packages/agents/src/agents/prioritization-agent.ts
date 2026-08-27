import type { PrioritizationResult } from "../prioritization/schema.js";
import type { PrioritizationInput } from "../prioritization/types.js";
import type { AgentContext } from "./types.js";

export interface PrioritizationOutcome {
  readonly result: PrioritizationResult;
  readonly meta: { readonly latencyMs: number };
}

/**
 * Stage 3: explains and packages the already-computed deterministic risk
 * score into a bounded, auditable priority tier + factor list. Never
 * recomputes the underlying score — see
 * `../prioritization/deterministic-prioritization-agent.ts` for the
 * concrete `DeterministicPrioritizationAgent` implementation.
 */
export interface PrioritizationAgent {
  readonly id: string;
  prioritize(input: PrioritizationInput, context: AgentContext): Promise<PrioritizationOutcome>;
}
