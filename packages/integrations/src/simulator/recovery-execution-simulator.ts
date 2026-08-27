import type {
  RecoverySimulationProvider,
  RecoverySimulationRequest,
  RecoverySimulationResult,
} from "../interfaces/recovery-simulation-provider.js";
import { seededFloat } from "./deterministic-random.js";

/**
 * Deterministic, credential-free implementation of
 * `RecoverySimulationProvider`. Never contacts Razorpay, a bank, a UPI
 * provider, or a customer — it is pure computation over `seededFloat`
 * (shared with `PaymentSimulator`/`RecoveryActionSimulator`, not
 * reimplemented here). Given the same seed and probability, it always
 * returns the same result — see Task 6 of the Phase 5 spec.
 */
export class RecoveryExecutionSimulator implements RecoverySimulationProvider {
  readonly name = "simulator";

  async simulate(request: RecoverySimulationRequest): Promise<RecoverySimulationResult> {
    const roll = seededFloat(request.seed);
    return { succeeded: roll < request.probabilityOfSuccess, roll };
  }
}
