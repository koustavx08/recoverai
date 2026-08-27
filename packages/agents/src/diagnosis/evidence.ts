import type { EvidenceItem } from "./schema.js";
import type { DiagnosisFacts, DiagnosisInput } from "./types.js";

/**
 * Builds the fixed bundle of evidence available for one diagnosis, entirely
 * from `DiagnosisInput`/`DiagnosisFacts` — never from a model. Every id here
 * is the complete, closed set of facts an LLM response is allowed to cite
 * (see `validation.ts`); anything else is treated as an invented reference.
 */
export function buildDiagnosisEvidence(
  input: DiagnosisInput,
  facts: DiagnosisFacts,
): readonly EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  evidence.push({
    id: "evidence-failure-code",
    type: "transaction",
    source: "deterministic_engine:failure_classifier",
    fact: `Failure classified as "${input.failureCode}": ${input.failureDescription}`,
    relevance: "Establishes the technical reason the payment attempt failed.",
    weight: 0.9,
  });

  evidence.push({
    id: "evidence-retryable-flag",
    type: "derived_signal",
    source: "deterministic_engine:failure_classifier",
    fact: `Failure category is marked as ${input.retryable ? "retryable" : "not retryable"}.`,
    relevance:
      "Hard constraint: a non-retryable failure category rules out any retry-based intervention.",
    weight: 1,
  });

  evidence.push({
    id: "evidence-attempt-count",
    type: "payment_attempt",
    source: "deterministic_engine:transaction_record",
    fact: `${input.attemptCount} payment attempt(s) recorded for this transaction.`,
    relevance: facts.isRepeatedFailure
      ? "Multiple attempts indicate a persistent, repeated failure pattern rather than an isolated glitch."
      : "A single attempt provides limited signal about whether a retry would help.",
    weight: facts.isRepeatedFailure ? 0.8 : 0.4,
  });

  evidence.push({
    id: "evidence-transaction-value",
    type: "transaction",
    source: "deterministic_engine:transaction_record",
    fact: `Transaction amount is ${input.amount.amount} ${input.amount.currency} (smallest unit), classified as ${facts.valueClass} value.`,
    relevance: "Transaction value informs how much recovery effort is proportionate.",
    weight: 0.5,
  });

  evidence.push({
    id: "evidence-payment-method",
    type: "transaction",
    source: "deterministic_engine:transaction_record",
    fact: `Payment method used was "${input.paymentMethod}".`,
    relevance: "Payment method affects which alternate-method or retry interventions are plausible.",
    weight: 0.3,
  });

  if (input.customerHistory) {
    evidence.push({
      id: "evidence-customer-history",
      type: "customer_history",
      source: "deterministic_engine:customer_history_index",
      fact: `Customer has ${facts.previousSuccessfulPayments} previous successful and ${facts.previousFailedPayments} previous failed payment(s) on record, reliability score ${input.customerHistory.reliabilityScore.toFixed(2)} (0-1).`,
      relevance: "Customer payment reliability informs how likely a follow-up attempt is to succeed.",
      weight: 0.7,
    });
  } else {
    evidence.push({
      id: "evidence-customer-history",
      type: "customer_history",
      source: "deterministic_engine:customer_history_index",
      fact: "No customer payment history is available for this customer.",
      relevance: "Absence of history limits confidence in any recoverability assessment.",
      weight: 0.3,
    });
  }

  if (input.riskScore !== undefined && input.recoverabilityScore !== undefined) {
    evidence.push({
      id: "evidence-risk-score",
      type: "risk_signal",
      source: "deterministic_engine:risk_scorer",
      fact: `Deterministic risk score ${input.riskScore}/100, recoverability score ${input.recoverabilityScore}/100.`,
      relevance: "Direct deterministic quantification of revenue risk and recoverability for this transaction.",
      weight: 0.85,
    });
  }

  return evidence;
}
