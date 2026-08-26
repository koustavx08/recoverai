import type { Logger } from "@recoverai/core";

/** Shared context passed to every agent invocation. */
export interface AgentContext {
  readonly logger: Logger;
}

/**
 * Wraps an agent's output with the reasoning metadata needed to persist an
 * `AgentDecision`. Every agent method returns this shape so the
 * orchestration layer can audit every step uniformly.
 */
export interface AgentOutcome<T> {
  readonly output: T;
  readonly reasoning?: string;
  readonly confidence?: number;
}
