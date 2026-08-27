import type { EvidenceItem } from "../diagnosis/schema.js";
import type { StrategyInput } from "./types.js";

/**
 * Builds the evidence bundle available to the Strategy Agent: the
 * diagnosis's own evidence (same objects, same ids — reused, never
 * recreated) plus a small number of new deterministic, strategy-specific
 * facts. Every id here is the complete, closed set an LLM response is
 * allowed to cite (see `validation.ts`) — supportingEvidence must always
 * trace back to evidence "already produced by deterministic
 * analysis/diagnosis," never invented fresh by the model.
 */
export function buildStrategyEvidence(input: StrategyInput): readonly EvidenceItem[] {
  const evidence: EvidenceItem[] = [...input.diagnosis.evidence];

  evidence.push({
    id: "evidence-priority",
    type: "risk_signal",
    source: "deterministic_engine:risk_scorer",
    fact: `Recovery priority classified as "${input.priority}".`,
    relevance: "Priority reflects how urgently this transaction is worth pursuing.",
    weight: 0.6,
  });

  if (input.hasSucceededWithAlternateMethod !== undefined) {
    evidence.push({
      id: "evidence-alternate-method-history",
      type: "customer_history",
      source: "deterministic_engine:customer_history_index",
      fact: input.hasSucceededWithAlternateMethod
        ? "Customer has previously completed a successful payment using a different payment method than the one that just failed."
        : "No record of this customer succeeding with a different payment method.",
      relevance: "Directly informs whether switching payment method is a promising strategy.",
      weight: 0.5,
    });
  }

  return evidence;
}
