import type { StrategyDecision } from "../strategy/schema.js";
import type { StrategyInput } from "../strategy/types.js";
import type { AgentContext } from "./types.js";

/**
 * Execution metadata for one `selectStrategy()` call — everything the audit
 * trail needs beyond the `StrategyDecision` itself. Mirrors
 * `DiagnosisExecutionMeta` in shape and intent.
 */
export interface StrategyExecutionMeta {
  readonly mode: "deterministic" | "llm";
  readonly provider: string | null;
  readonly model: string | null;
  readonly latencyMs: number;
  readonly validationSuccess: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface StrategyOutcome {
  readonly decision: StrategyDecision;
  readonly meta: StrategyExecutionMeta;
}

/**
 * Stage 4: selects a bounded, explainable recovery strategy from a
 * validated `Diagnosis` plus deterministic risk context — grounded in
 * evidence, policy-approved before it ever reaches a model, never
 * executing anything itself. See `../strategy/` for the concrete
 * `GroundedStrategyAgent` implementation (LLM-assisted with a
 * deterministic fallback) and `docs/agent-architecture.md`.
 */
export interface StrategyAgent {
  readonly id: string;
  selectStrategy(input: StrategyInput, context: AgentContext): Promise<StrategyOutcome>;
}
