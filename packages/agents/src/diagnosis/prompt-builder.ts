import {
  DIAGNOSIS_CATEGORIES,
  INTERVENTION_TYPES,
  RECOVERABILITY_ASSESSMENTS,
  type EvidenceItem,
} from "./schema.js";
import type { DiagnosisFacts, DiagnosisInput } from "./types.js";

/**
 * System-level instructions: role, hard safety rules, and output
 * constraints. Kept separate from the per-request evidence/prompt so the
 * rules never depend on (or get diluted by) any specific transaction's
 * data. See docs/agent-architecture.md and Task 7/29 of the diagnosis
 * agent spec for why this must not be one giant inline prompt.
 */
const SYSTEM_PROMPT = `You are the RecoverAI Diagnosis Agent, a structured decision-support component inside an automated revenue-recovery pipeline for failed payments.

You are not the source of truth. A deterministic rules engine has already extracted the facts and evidence below; you may only reason over them.

Hard rules — violating any of these makes your response invalid:
1. Use ONLY the evidence items you are given. Never invent, assume, or infer a fact that is not present in the evidence list — no customer name, bank, location, card issuer, device, IP address, or behavior not explicitly listed.
2. You may only cite evidence by the exact "id" values you were given. Never invent an evidence id.
3. "category" must be exactly one of the allowed values you are given — never a new or modified category.
4. If the evidence provided is insufficient to support a confident diagnosis, you MUST return category "insufficient_evidence" rather than guessing.
5. You must respect the deterministic "retryable" flag: if retryable is false, you must not include "RETRY" in interventionEligibility, and retryRecommendation.recommended must be false.
6. Confidence must reflect genuine uncertainty in this specific case — do not output artificial precision (e.g. do not always answer the same confidence value).
7. Explicitly list any limitations or missing information in "limitations" — do not omit known gaps.
8. You do not execute any action. Never claim that money has been recovered, or that a payment, refund, notification, or retry has actually occurred — you only produce a diagnosis and a bounded recommendation.
9. "interventionEligibility" values must only come from the fixed allowed list — never invent a new action type.
10. Return your answer only through the structured tool call you are given — never as free-form prose.`;

export interface DiagnosisPromptContext {
  readonly input: DiagnosisInput;
  readonly facts: DiagnosisFacts;
  readonly evidence: readonly EvidenceItem[];
}

export interface DiagnosisPrompt {
  readonly system: string;
  readonly prompt: string;
}

/**
 * Assembles the per-request prompt from three logically separate parts —
 * domain rules (the bounded enums), structured evidence, and the
 * transaction/derived-signal facts — so none of it needs to be duplicated
 * or hand-edited inline inside the agent implementation.
 */
export class DiagnosisPromptBuilder {
  build({ input, facts, evidence }: DiagnosisPromptContext): DiagnosisPrompt {
    const domainRules = [
      `Allowed category values: ${DIAGNOSIS_CATEGORIES.join(", ")}`,
      `Allowed recoverabilityAssessment values: ${RECOVERABILITY_ASSESSMENTS.join(", ")}`,
      `Allowed interventionEligibility values: ${INTERVENTION_TYPES.join(", ")}`,
      `Known evidence ids you may cite (and ONLY these): ${evidence.map((e) => e.id).join(", ")}`,
    ].join("\n");

    const evidenceBlock = evidence
      .map(
        (e) =>
          `- [${e.id}] (${e.type}, weight ${e.weight}): ${e.fact} — why it matters: ${e.relevance}`,
      )
      .join("\n");

    const derivedSignals = [
      `valueClass: ${facts.valueClass}`,
      `isRepeatedFailure: ${facts.isRepeatedFailure}`,
      `isNonRetryable: ${facts.isNonRetryable}`,
      `isTimeout: ${facts.isTimeout}`,
      `isUpiFailure: ${facts.isUpiFailure}`,
      `isIssuerDecline: ${facts.isIssuerDecline}`,
      `isInsufficientFunds: ${facts.isInsufficientFunds}`,
      `isCheckoutAbandonment: ${facts.isCheckoutAbandonment}`,
      `isRefundRelated: ${facts.isRefundRelated}`,
      `evidenceSufficient: ${facts.evidenceSufficient}`,
    ].join("\n");

    const prompt = `Transaction facts:
transactionId: ${input.transactionId}
amount: ${input.amount.amount} ${input.amount.currency}
paymentMethod: ${input.paymentMethod}
transactionStatus: ${input.transactionStatus}
attemptCount: ${input.attemptCount}
failureCode: ${input.failureCode}
retryable: ${input.retryable}
riskScore: ${input.riskScore !== undefined ? input.riskScore : "unavailable"}
recoverabilityScore: ${input.recoverabilityScore !== undefined ? input.recoverabilityScore : "unavailable"}

Derived deterministic signals:
${derivedSignals}

Evidence (cite ONLY by id, never invent new ones):
${evidenceBlock}

Domain rules:
${domainRules}

Task: produce a structured diagnosis for transactionId "${input.transactionId}" using only the evidence above. Reference every piece of supporting evidence you rely on via "evidenceIds". Respond only through the structured tool you were given.`;

    return { system: SYSTEM_PROMPT, prompt };
  }
}
