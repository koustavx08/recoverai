import type { DetectionResult } from "../detection/schema.js";
import type { DetectionInput } from "../detection/types.js";
import type { AgentContext } from "./types.js";

export interface DetectionOutcome {
  readonly result: DetectionResult;
  readonly meta: { readonly latencyMs: number };
}

/**
 * Stage 1: scans an incoming transaction and decides whether it represents
 * a revenue-loss event the rest of the pipeline should process now
 * (`detected` + `actionable`). Deterministic — see
 * `../detection/deterministic-detection-agent.ts` for the concrete
 * `DeterministicDetectionAgent` implementation.
 */
export interface DetectionAgent {
  readonly id: string;
  detect(input: DetectionInput, context: AgentContext): Promise<DetectionOutcome>;
}
