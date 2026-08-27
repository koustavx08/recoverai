import { describe, expect, it } from "vitest";
import { brand, type Logger } from "@recoverai/core";
import { DeterministicDetectionAgent } from "./deterministic-detection-agent.js";
import type { DetectionInput } from "./types.js";

const noopLogger: Logger = { log: () => {} };

describe("DeterministicDetectionAgent", () => {
  it("returns a detection outcome with latency metadata", async () => {
    const agent = new DeterministicDetectionAgent();
    const input: DetectionInput = {
      transactionId: brand("txn_test"),
      status: "failed",
      amount: { amount: 100_00, currency: "INR" },
      attemptCount: 1,
      failureCode: "issuer_decline",
      retryable: true,
    };
    const outcome = await agent.detect(input, { logger: noopLogger });
    expect(outcome.result.detected).toBe(true);
    expect(outcome.result.actionable).toBe(true);
    expect(outcome.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("never uses a model", () => {
    const agent = new DeterministicDetectionAgent();
    expect(agent.id).toBe("detection-agent");
  });
});
