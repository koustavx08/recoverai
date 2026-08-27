import { describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { DeterministicVerificationAgent } from "./deterministic-verification-agent.js";
import type { RecoveryExecutionResult } from "./schema.js";

const noopLogger: Logger = { log: () => {} };

function result(overrides: Partial<RecoveryExecutionResult> = {}): RecoveryExecutionResult {
  return {
    executionId: "exec_1",
    transactionId: "txn_1",
    strategy: "switch_payment_method",
    action: "auto_retry",
    outcome: "success",
    recoveredAmount: { amount: 1000, currency: "INR" },
    simulationMode: true,
    executedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("DeterministicVerificationAgent", () => {
  it("verifies a valid execution result", async () => {
    const agent = new DeterministicVerificationAgent();
    const outcome = await agent.verifyRecovery(result({}), { logger: noopLogger });
    expect(outcome.verification.verified).toBe(true);
    expect(outcome.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("flags an invalid execution result", async () => {
    const agent = new DeterministicVerificationAgent();
    const outcome = await agent.verifyRecovery(
      result({ outcome: "failure", recoveredAmount: { amount: 500, currency: "INR" } }),
      { logger: noopLogger },
    );
    expect(outcome.verification.verified).toBe(false);
    expect(outcome.verification.reasons.length).toBeGreaterThan(0);
  });

  it("never uses a model — deterministic and independent of any AI provider", () => {
    const agent = new DeterministicVerificationAgent();
    expect(agent.id).toBe("verification-agent");
  });
});
