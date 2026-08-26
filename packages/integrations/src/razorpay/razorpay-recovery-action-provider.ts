import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { RecoveryActionProvider } from "../interfaces/recovery-action-provider.js";
import type { RazorpayCredentials } from "./razorpay-config.js";

/**
 * Real Razorpay-backed `RecoveryActionProvider` (e.g. Payment Links,
 * Smart Collect retries).
 *
 * TODO(razorpay-integration): implement once a strategy/action design is
 * finalized. Intentionally unimplemented for now.
 */
export class RazorpayRecoveryActionProvider implements RecoveryActionProvider {
  readonly name = "razorpay";

  constructor(private readonly credentials: RazorpayCredentials) {
    void this.credentials;
  }

  async execute(_action: RecoveryAction): Promise<RecoveryResult> {
    throw new Error(
      "RazorpayRecoveryActionProvider.execute is not implemented yet. Use RecoveryActionSimulator for now.",
    );
  }

  async verify(_action: RecoveryAction): Promise<RecoveryResult> {
    throw new Error(
      "RazorpayRecoveryActionProvider.verify is not implemented yet. Use RecoveryActionSimulator for now.",
    );
  }
}
