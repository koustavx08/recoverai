import type { Money } from "@recoverai/core";

export interface RecoverySimulationRequest {
  /** Deterministic seed — same seed always produces the same roll. Callers derive this from transactionId + strategy + action (+ an optional explicit seed override) so results are reproducible per Task 6. */
  readonly seed: string;
  /** Pre-computed deterministically by the caller (see `@recoverai/agents`' simulation-profile.ts) — this provider does not decide probability, only resolves a seeded draw against it. */
  readonly probabilityOfSuccess: number;
  readonly amount: Money;
}

export interface RecoverySimulationResult {
  readonly succeeded: boolean;
  /** The raw deterministic [0, 1) draw, kept for audit/explainability — not a secret, safe to log. */
  readonly roll: number;
}

/**
 * Abstraction over whatever resolves a simulated recovery attempt to
 * success/failure. The only implementation in this repo —
 * `RecoveryExecutionSimulator` — never contacts Razorpay, a bank, a UPI
 * provider, or a customer; it is pure, deterministic computation. This
 * interface exists so `@recoverai/agents`' `RecoveryAgent` never depends on
 * the concrete simulator (or, later, a real execution backend) directly.
 */
export interface RecoverySimulationProvider {
  readonly name: string;
  simulate(request: RecoverySimulationRequest): Promise<RecoverySimulationResult>;
}
