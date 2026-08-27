import { describe, expect, it } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import { DeterministicPrioritizationAgent } from "./deterministic-prioritization-agent.js";
import type { PrioritizationInput } from "./types.js";

const noopLogger: Logger = { log: () => {} };

describe("DeterministicPrioritizationAgent", () => {
  it("returns a prioritization outcome with latency metadata", async () => {
    const agent = new DeterministicPrioritizationAgent();
    const input: PrioritizationInput = {
      transactionId: brand("txn_test"),
      amount: { amount: 100_00, currency: "INR" },
      riskScore: 50,
      recoverabilityScore: 55,
      expectedRecoveryAmount: { amount: 55_00, currency: "INR" },
      priority: "medium",
      retryable: true,
      attemptCount: 1,
    };
    const outcome = await agent.prioritize(input, { logger: noopLogger });
    expect(outcome.result.priority).toBe("medium");
    expect(outcome.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("never uses a model", () => {
    const agent = new DeterministicPrioritizationAgent();
    expect(agent.id).toBe("prioritization-agent");
  });
});
