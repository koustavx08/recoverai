import type { RecoveryStrategyType } from "@recoverai/core";
import type { DiagnosisCategory } from "../diagnosis/schema.js";
import type { RecoveryExecutionRequest } from "./types.js";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** How much each strategy tends to help, independent of diagnosis category — a small, fixed, documented adjustment, not a dominant factor. */
const STRATEGY_FACTOR: Readonly<Record<RecoveryStrategyType, number>> = {
  retry_payment: 0.05,
  wait_and_retry: 0.15,
  switch_payment_method: 0.2,
  offer_installments: 0.05,
  manual_followup: 0,
  send_payment_link: 0.05,
  manual_review: 0,
  no_action: 0,
};

/** How much the diagnosis category itself nudges the odds — e.g. a timeout is often transient (recovers well with a delayed retry), while a repeated failure pattern is a bad sign. */
const CATEGORY_ADJUSTMENT: Readonly<Record<DiagnosisCategory, number>> = {
  issuer_decline: 0.05,
  insufficient_funds: -0.05,
  upi_failure: 0.05,
  network_timeout: 0.15,
  expired_card: 0.05,
  repeated_failure: -0.15,
  checkout_abandonment: 0,
  refund_related: -0.2,
  non_retryable: -1,
  insufficient_evidence: -0.1,
  unknown: -0.1,
};

/** Transaction value (paise) above which the simulator is slightly more conservative — mirrors the same fixed, documented anchor used elsewhere (e.g. `@recoverai/agents`' diagnosis facts), never re-derived from the dataset. */
const HIGH_VALUE_ANCHOR_PAISE = 50_000_00;

/** Attempts already made reduce the odds this one succeeds — capped so it never dominates the other factors. */
const ATTEMPT_PENALTY_PER_ATTEMPT = 0.05;
const MAX_ATTEMPT_PENALTY = 0.3;

export interface SimulationProfile {
  /** 0–1, bounded — the deterministic estimate the simulator draws against. Never presented as a real-world prediction; see docs/agent-architecture.md. */
  readonly probabilityOfSuccess: number;
  /** Human-readable, ordered explanation of every factor that contributed — kept so the estimate is never a black box. */
  readonly factors: readonly string[];
}

/**
 * Computes a deterministic, explainable "simulation estimate" — never
 * presented as a real-world prediction — from the diagnosis category, the
 * chosen strategy, the deterministic recoverability score, prior attempts,
 * alternate-payment-method history, and transaction value. Pure: same
 * input always produces the same profile.
 */
export function computeSimulationProfile(request: RecoveryExecutionRequest): SimulationProfile {
  const strategy = request.strategyDecision.strategy;
  const category = request.diagnosis.category;
  const factors: string[] = [];

  const base = deriveBaseFromDiagnosis(request);
  factors.push(`base recoverability signal: ${base.toFixed(2)}`);

  const strategyFactor = STRATEGY_FACTOR[strategy];
  factors.push(`strategy factor (${strategy}): ${strategyFactor >= 0 ? "+" : ""}${strategyFactor.toFixed(2)}`);

  const categoryAdjustment = CATEGORY_ADJUSTMENT[category];
  factors.push(`category adjustment (${category}): ${categoryAdjustment >= 0 ? "+" : ""}${categoryAdjustment.toFixed(2)}`);

  let alternateMethodBoost = 0;
  if (strategy === "switch_payment_method" && request.hasSucceededWithAlternateMethod === true) {
    alternateMethodBoost = 0.15;
    factors.push(`alternate-payment-method success history: +${alternateMethodBoost.toFixed(2)}`);
  }

  const attemptPenalty = Math.min(MAX_ATTEMPT_PENALTY, request.attemptCount * ATTEMPT_PENALTY_PER_ATTEMPT);
  if (attemptPenalty > 0) {
    factors.push(`prior attempts (${request.attemptCount}): -${attemptPenalty.toFixed(2)}`);
  }

  let valueDamping = 0;
  if (request.amount.amount >= HIGH_VALUE_ANCHOR_PAISE) {
    valueDamping = -0.05;
    factors.push(`high transaction value: ${valueDamping.toFixed(2)}`);
  }

  const probabilityOfSuccess = clamp01(
    base + strategyFactor + categoryAdjustment + alternateMethodBoost - attemptPenalty + valueDamping,
  );
  factors.push(`simulation estimate (not a real-world prediction): ${probabilityOfSuccess.toFixed(2)}`);

  return { probabilityOfSuccess, factors };
}

/** Anchors the profile in the deterministic recoverability signal already established upstream (the diagnosis's own recoverabilityAssessment), never re-deriving a fresh, disconnected number. */
function deriveBaseFromDiagnosis(request: RecoveryExecutionRequest): number {
  switch (request.diagnosis.recoverabilityAssessment) {
    case "LIKELY_RECOVERABLE":
      return 0.65;
    case "POSSIBLY_RECOVERABLE":
      return 0.45;
    case "LOW_RECOVERABILITY":
      return 0.2;
    case "INSUFFICIENT_EVIDENCE":
      return 0.1;
  }
}
