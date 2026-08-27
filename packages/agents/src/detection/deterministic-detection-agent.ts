import type { DetectionAgent, DetectionOutcome } from "../agents/detection-agent.js";
import type { AgentContext } from "../agents/types.js";
import { detectRevenueRisk } from "./deterministic-detection.js";
import type { DetectionInput } from "./types.js";

/**
 * The Detection Agent: a cheap, fully deterministic gate that decides
 * whether a transaction is a revenue-risk event worth pursuing, before the
 * more expensive Diagnosis/Strategy/Recovery stages ever run. No model
 * involved — see `deterministic-detection.ts` for the rules.
 */
export class DeterministicDetectionAgent implements DetectionAgent {
  readonly id = "detection-agent";

  async detect(input: DetectionInput, context: AgentContext): Promise<DetectionOutcome> {
    const startedAt = Date.now();
    const result = detectRevenueRisk(input);

    context.logger.log("info", "detection agent: evaluated transaction", {
      transactionId: input.transactionId,
      detected: result.detected,
      actionable: result.actionable,
      severity: result.severity,
    });

    return { result, meta: { latencyMs: Date.now() - startedAt } };
  }
}
