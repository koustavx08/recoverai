import type { EvidenceItem } from "../diagnosis/schema.js";
import type { StrategyDecision } from "./schema.js";
import { requiresHumanApproval, type StrategyPolicyContext } from "./policy.js";
import type { StrategyInput } from "./types.js";

/** Bumped whenever the deterministic policy or the LLM prompt/schema changes in a way that would materially change output — stored on every `StrategyDecision` for audit-trail reproducibility. */
export const STRATEGY_AGENT_VERSION = "strategy-agent@1";

function determineConfidence(input: StrategyInput, policy: StrategyPolicyContext): number {
  if (policy.preferredStrategy === "manual_review") return 0.3;
  // Anchored to the deterministic recoverability score already established
  // by risk-scoring — never a fabricated/independent number.
  return Math.min(0.85, Math.max(0.35, input.recoverabilityScore / 100));
}

function buildRationale(input: StrategyInput, policy: StrategyPolicyContext): string {
  return (
    `Diagnosis category "${input.diagnosis.category}" (${input.diagnosis.recoverabilityAssessment}) ` +
    `with risk ${input.riskScore}/100 and recoverability ${input.recoverabilityScore}/100 maps to ` +
    `"${policy.preferredStrategy}" under the deterministic strategy policy, from candidates: ${policy.allowedStrategies.join(", ")}.`
  );
}

function buildExpectedOutcome(input: StrategyInput, policy: StrategyPolicyContext): string {
  if (policy.preferredStrategy === "manual_review" || policy.preferredStrategy === "no_action") {
    return "No automatic recovery outcome is expected from this strategy alone — it routes the transaction for human judgment rather than pursuing further automated recovery.";
  }
  return (
    `If pursued, this strategy may improve the chance of recovering some or all of the ` +
    `transaction (deterministic estimate: up to ${input.expectedRecoveryAmount.amount} ${input.expectedRecoveryAmount.currency}) — ` +
    `this is a projection, not a guarantee, and no recovery has been attempted or confirmed.`
  );
}

function buildLimitations(input: StrategyInput): readonly string[] {
  const limitations: string[] = [];
  if (input.hasSucceededWithAlternateMethod === undefined) {
    limitations.push("Whether this customer has succeeded with an alternate payment method is unknown.");
  }
  if (input.diagnosis.metadata.mode === "deterministic") {
    limitations.push("Underlying diagnosis was produced deterministically, without AI-assisted reasoning.");
  }
  limitations.push(
    "This strategy decision was produced by deterministic policy only, without AI-assisted reasoning.",
  );
  return limitations;
}

export interface DeterministicStrategyOptions {
  readonly now?: Date;
  readonly fallbackReason?: string;
}

/**
 * Produces a fully valid, policy-bounded `StrategyDecision` using only the
 * deterministic policy layer — no model call involved. This is what backs
 * `recoverai agent --stage strategy` without an API key, and what every LLM
 * path falls back to on any failure (provider error, invalid output, failed
 * evidence-grounding or policy validation). It never claims to be an LLM
 * result: `metadata.mode` is always accurate.
 */
export function buildDeterministicStrategy(
  input: StrategyInput,
  evidence: readonly EvidenceItem[],
  policy: StrategyPolicyContext,
  options: DeterministicStrategyOptions = {},
): StrategyDecision {
  const now = options.now ?? new Date();

  return {
    transactionId: input.transactionId,
    strategy: policy.preferredStrategy,
    confidence: determineConfidence(input, policy),
    rationale: buildRationale(input, policy),
    supportingEvidence: [...evidence],
    expectedOutcome: buildExpectedOutcome(input, policy),
    constraints: [...policy.constraints],
    requiresHumanApproval: requiresHumanApproval(policy.preferredStrategy),
    limitations: [...buildLimitations(input)],
    metadata: {
      mode: "deterministic",
      provider: null,
      model: null,
      agentVersion: STRATEGY_AGENT_VERSION,
      generatedAt: now.toISOString(),
      fallbackUsed: options.fallbackReason !== undefined,
      fallbackReason: options.fallbackReason,
    },
  };
}
