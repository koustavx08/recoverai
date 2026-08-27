import type { ZodType } from "zod";

/**
 * A vendor-agnostic request for structured (schema-validated) generation.
 * Callers never see raw model prose — `AIModelProvider` implementations
 * are responsible for forcing the underlying model to return data that
 * conforms to `schema`, and for validating it before returning.
 */
export interface StructuredGenerationRequest<T> {
  /** System-level instructions: role, constraints, safety rules. */
  readonly system: string;
  /** The user-turn prompt: the actual task plus the evidence to reason over. */
  readonly prompt: string;
  readonly schema: ZodType<T>;
  /** Short machine name for the output schema (e.g. "diagnosis"). */
  readonly schemaName: string;
  readonly schemaDescription: string;
  readonly maxTokens?: number;
}

export interface StructuredGenerationUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface StructuredGenerationResult<T> {
  readonly data: T;
  readonly model: string;
  readonly usage: StructuredGenerationUsage;
  readonly latencyMs: number;
}

/**
 * Provider-independent interface for AI models. Agents depend on this,
 * never on a vendor SDK directly — see `AnthropicProvider` for the one
 * concrete implementation today.
 */
export interface AIModelProvider {
  readonly name: string;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
}
