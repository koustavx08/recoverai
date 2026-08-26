import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
} from "../interfaces/payment-provider.js";
import { seededFloat } from "./deterministic-random.js";

export interface PaymentSimulatorOptions {
  /** Probability (0–1) that a simulated charge succeeds. Default 0.7. */
  readonly successRate?: number;
}

const SIMULATED_FAILURE_REASONS = [
  "issuer_decline",
  "insufficient_funds",
  "upi_failure",
  "network_timeout",
  "expired_card",
] as const;

/**
 * Deterministic, credential-free implementation of `PaymentProvider`. Given
 * the same transaction id, it always produces the same outcome, so the
 * rest of the system (CLI, agents, tests) can be exercised end-to-end
 * without talking to a real payment processor.
 *
 * This is sandbox plumbing only — it does not model real issuer behavior
 * and its outcomes must never be presented to a merchant as real money
 * movement.
 */
export class PaymentSimulator implements PaymentProvider {
  readonly name = "simulator";
  private readonly successRate: number;

  constructor(options: PaymentSimulatorOptions = {}) {
    this.successRate = options.successRate ?? 0.7;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const roll = seededFloat(`${request.transactionId}:${request.paymentMethod}`);
    const succeeded = roll < this.successRate;

    if (succeeded) {
      return {
        succeeded: true,
        providerReference: `sim_${request.transactionId}`,
      };
    }

    const reasonIndex = Math.floor(roll * 1000) % SIMULATED_FAILURE_REASONS.length;
    return {
      succeeded: false,
      providerReference: `sim_${request.transactionId}`,
      failureReasonCode: SIMULATED_FAILURE_REASONS[reasonIndex],
      providerErrorMessage: "Simulated decline (no real charge was attempted).",
    };
  }

  async getChargeStatus(providerReference: string): Promise<ChargeResult | null> {
    if (!providerReference.startsWith("sim_")) return null;
    const transactionId = providerReference.slice("sim_".length);
    return this.charge({
      transactionId: transactionId as ChargeRequest["transactionId"],
      amount: { amount: 0, currency: "INR" },
      paymentMethod: "unknown",
    });
  }
}
