import { brand, type RecoveryAction, type RecoveryResult } from "@recoverai/core";
import type { RecoveryActionProvider } from "../interfaces/recovery-action-provider.js";
import { seededFloat } from "./deterministic-random.js";

export interface RecoveryActionSimulatorOptions {
  /** Probability (0–1) that a simulated recovery action succeeds. Default 0.5. */
  readonly successRate?: number;
}

/**
 * Deterministic, credential-free implementation of `RecoveryActionProvider`.
 * Simulates executing and verifying a recovery action (e.g. a retry or a
 * payment-link send) without contacting any real notification or payment
 * infrastructure.
 */
export class RecoveryActionSimulator implements RecoveryActionProvider {
  readonly name = "simulator";
  private readonly successRate: number;

  constructor(options: RecoveryActionSimulatorOptions = {}) {
    this.successRate = options.successRate ?? 0.5;
  }

  async execute(action: RecoveryAction): Promise<RecoveryResult> {
    const roll = seededFloat(`${action.id}:${action.type}:execute`);
    const succeeded = roll < this.successRate;

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      notes: succeeded
        ? "Simulated recovery action executed successfully."
        : "Simulated recovery action did not succeed.",
    };
  }

  async verify(action: RecoveryAction): Promise<RecoveryResult> {
    // Verification re-derives the same deterministic outcome as execute()
    // so repeated verification calls are stable for a given action.
    const roll = seededFloat(`${action.id}:${action.type}:execute`);
    const succeeded = roll < this.successRate;

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      verifiedAt: brand<string, "ISODateString">(new Date().toISOString()),
      notes: succeeded
        ? "Simulated verification confirmed recovery."
        : "Simulated verification found no recovery.",
    };
  }
}
