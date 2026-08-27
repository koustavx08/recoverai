import type { Diagnosis } from "../diagnosis/schema.js";
import type { DiagnosisInput } from "../diagnosis/types.js";
import type { AgentContext } from "./types.js";

/**
 * Execution metadata for one `diagnose()` call — everything the audit trail
 * needs beyond the `Diagnosis` itself (which mode actually ran, how long it
 * took, whether the LLM path was attempted and rejected). Kept separate
 * from `Diagnosis` because it describes *how* the diagnosis was produced,
 * not what was concluded.
 */
export interface DiagnosisExecutionMeta {
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

export interface DiagnosisOutcome {
  readonly diagnosis: Diagnosis;
  readonly meta: DiagnosisExecutionMeta;
}

/**
 * Stage 2: analyzes structured transaction evidence and explains *why* a
 * failed payment is potentially recoverable — grounded in deterministic
 * facts, never inventing them. See `../diagnosis/` for the concrete
 * `GroundedDiagnosisAgent` implementation (LLM-assisted with a deterministic
 * fallback) and `docs/agent-architecture.md` for the pipeline this fits
 * into.
 */
export interface DiagnosisAgent {
  readonly id: string;
  diagnose(input: DiagnosisInput, context: AgentContext): Promise<DiagnosisOutcome>;
}
