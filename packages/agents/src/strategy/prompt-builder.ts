import type { RecoveryStrategyType } from "@recoverai/core";
import type { EvidenceItem } from "../diagnosis/schema.js";
import type { StrategyInput } from "./types.js";

/**
 * System-level instructions: role and hard safety rules, kept separate from
 * the per-request evidence/context so the constraints never depend on (or
 * get diluted by) any specific transaction's data.
 */
const SYSTEM_PROMPT = `You are the RecoverAI Strategy Agent, a structured decision-support component inside an automated revenue-recovery pipeline for failed payments.

You are not the source of truth. A deterministic diagnosis and a deterministic strategy policy have already established the facts, the evidence, and the allowed candidate strategies below; you may only reason over them.

Hard rules — violating any of these makes your response invalid:
1. Use ONLY the evidence items you are given. Never invent, assume, or infer a fact not present in the evidence list.
2. You may only cite evidence by the exact "id" values you were given. Never invent an evidence id.
3. "strategy" must be exactly one of the allowed strategies you are given for this decision — never a strategy outside that list, even if it is a value that exists elsewhere in the system.
4. Never invent a new intervention or action name that is not in the allowed strategy list.
5. If the evidence is too weak to justify anything more specific, select "manual_review" or "no_action" when it is in the allowed list, rather than guessing.
6. Do not override the deterministic policy: the allowed strategy list has already excluded anything unsafe for this transaction (e.g. retries against a non-retryable failure) — do not reason your way back to an excluded strategy.
7. You do not execute any action. Never claim that a payment link was sent, a retry was attempted, a customer was contacted, or that revenue has been recovered — you only produce a recommendation.
8. "expectedOutcome" must describe a plausible, qualitative outcome — never state a specific guaranteed recovered amount as fact.
9. Confidence must reflect genuine uncertainty in this specific case — do not output artificial precision.
10. Explicitly list any limitations or missing information in "limitations".
11. Return your answer only through the structured tool call you are given — never as free-form prose.`;

export interface StrategyPromptContext {
  readonly input: StrategyInput;
  readonly evidence: readonly EvidenceItem[];
  readonly allowedStrategies: readonly RecoveryStrategyType[];
  readonly constraints: readonly string[];
}

export interface StrategyPrompt {
  readonly system: string;
  readonly prompt: string;
}

/**
 * Assembles the per-request prompt from logically separate parts — the
 * diagnosis summary, deterministic risk context, structured evidence, and
 * the policy-approved candidate set — so none of it is hand-duplicated
 * inline inside the agent implementation.
 */
export class StrategyPromptBuilder {
  build({ input, evidence, allowedStrategies, constraints }: StrategyPromptContext): StrategyPrompt {
    const evidenceBlock = evidence
      .map(
        (e) =>
          `- [${e.id}] (${e.type}, weight ${e.weight}): ${e.fact} — why it matters: ${e.relevance}`,
      )
      .join("\n");

    const domainRules = [
      `Allowed strategies for this decision (choose ONLY from these): ${allowedStrategies.join(", ")}`,
      `Known evidence ids you may cite (and ONLY these): ${evidence.map((e) => e.id).join(", ")}`,
      constraints.length > 0
        ? `Deterministic policy constraints already applied: ${constraints.join(" | ")}`
        : "No additional deterministic policy constraints were applied beyond the base category mapping.",
    ].join("\n");

    const prompt = `Diagnosis (already produced, grounded, and validated):
transactionId: ${input.transactionId}
category: ${input.diagnosis.category}
recoverabilityAssessment: ${input.diagnosis.recoverabilityAssessment}
diagnosisConfidence: ${input.diagnosis.confidence}
diagnosisExplanation: ${input.diagnosis.explanation}

Deterministic risk context:
amount: ${input.amount.amount} ${input.amount.currency}
riskScore: ${input.riskScore}
recoverabilityScore: ${input.recoverabilityScore}
priority: ${input.priority}
attemptCount: ${input.attemptCount}
retryable: ${input.retryable}
hasSucceededWithAlternateMethod: ${input.hasSucceededWithAlternateMethod ?? "unknown"}

Evidence (cite ONLY by id, never invent new ones):
${evidenceBlock}

Domain rules:
${domainRules}

Task: select exactly one strategy from the allowed list for transactionId "${input.transactionId}", using only the evidence above. Reference every piece of supporting evidence you rely on via "evidenceIds". Respond only through the structured tool you were given.`;

    return { system: SYSTEM_PROMPT, prompt };
  }
}
