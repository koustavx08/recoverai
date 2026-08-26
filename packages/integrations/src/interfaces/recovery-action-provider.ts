import type { RecoveryAction, RecoveryResult } from "@recoverai/core";

/**
 * Abstraction over whatever executes a RecoveryAction in the real world:
 * sending a payment link, retrying a charge, dispatching a notification.
 * Real implementations (email/SMS/WhatsApp senders, Razorpay retry APIs,
 * ...) and the simulator both implement this same contract.
 */
export interface RecoveryActionProvider {
  readonly name: string;

  /** Executes the given recovery action and returns its immediate outcome. */
  execute(action: RecoveryAction): Promise<RecoveryResult>;

  /** Re-checks whether a previously executed action has since succeeded. */
  verify(action: RecoveryAction): Promise<RecoveryResult>;
}
