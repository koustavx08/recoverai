import type { RecoveryStrategyType } from "@recoverai/core";
import type { DiagnosisCategory } from "../diagnosis/schema.js";
import type { StrategyInput } from "./types.js";

/**
 * Every strategy candidate is policy-approved *before* it ever reaches the
 * model — this table is the single source of truth for "what could
 * plausibly help for this diagnosis category," ordered by preference
 * (first entry is preferred, all else being deterministically equal).
 * Adjusted from the illustrative mapping in the Phase 4 spec to reuse
 * `@recoverai/core`'s existing `RecoveryStrategyType` names
 * (`switch_payment_method`, `manual_followup`, `send_payment_link`) rather
 * than introducing synonymous new ones, plus the two genuinely new
 * concepts this phase needs (`wait_and_retry`, `manual_review`).
 */
export const STRATEGY_POLICY_BY_CATEGORY: Readonly<
  Record<DiagnosisCategory, readonly RecoveryStrategyType[]>
> = {
  issuer_decline: ["switch_payment_method", "wait_and_retry", "manual_followup"],
  insufficient_funds: ["manual_followup", "wait_and_retry", "no_action"],
  upi_failure: ["wait_and_retry", "switch_payment_method"],
  network_timeout: ["wait_and_retry", "retry_payment"],
  expired_card: ["switch_payment_method", "manual_followup"],
  repeated_failure: ["manual_followup", "manual_review", "no_action"],
  checkout_abandonment: ["send_payment_link", "manual_followup"],
  refund_related: ["manual_review", "no_action"],
  non_retryable: ["no_action", "manual_review"],
  insufficient_evidence: ["manual_review", "no_action"],
  unknown: ["manual_review", "no_action"],
};

/**
 * Whether a strategy requires a human to approve it before any future
 * execution phase could act on it. Deterministic and never overridden by
 * the model — an `Record` keyed by the full `RecoveryStrategyType` enum, so
 * TypeScript forces every future addition to the enum to get an explicit
 * approval-requirement decision here rather than silently defaulting to
 * "safe." `manual_review` always requires approval; `send_payment_link`,
 * `manual_followup`, and `offer_installments` do too — they cause a
 * meaningful external customer-facing action or change a financial term,
 * so none of them are assumed safe to auto-execute.
 */
export const STRATEGY_REQUIRES_HUMAN_APPROVAL: Readonly<Record<RecoveryStrategyType, boolean>> = {
  retry_payment: false,
  wait_and_retry: false,
  switch_payment_method: false,
  offer_installments: true,
  send_payment_link: true,
  manual_followup: true,
  manual_review: true,
  no_action: false,
};

/** Attempts at or above this cap rule out further automatic retry-based strategies. */
export const STRATEGY_MAX_RETRY_ATTEMPTS = 3;

/** Below this deterministic recoverability score, only escalation/no-op strategies are policy-approved, regardless of category. */
export const LOW_RECOVERABILITY_FLOOR = 15;

const RETRY_BASED_STRATEGIES: ReadonlySet<RecoveryStrategyType> = new Set([
  "retry_payment",
  "wait_and_retry",
]);

const ESCALATION_STRATEGIES: readonly RecoveryStrategyType[] = ["manual_review", "no_action"];

export interface StrategyPolicyContext {
  /** The full policy-approved candidate set for this decision, in preference order — never empty. */
  readonly allowedStrategies: readonly RecoveryStrategyType[];
  /** The single deterministic best pick from `allowedStrategies` — what the fallback selects, and what an AI choice is graded/validated against for plausibility (not required to match). */
  readonly preferredStrategy: RecoveryStrategyType;
  /** Human-readable notes on what was excluded and why — becomes `StrategyDecision.constraints`. */
  readonly constraints: readonly string[];
}

/** Whether `strategy` is policy-approved for the given diagnosis category, ignoring any of the finer-grained deterministic narrowing `buildStrategyPolicyContext` applies. */
export function isStrategyAllowedForCategory(
  category: DiagnosisCategory,
  strategy: RecoveryStrategyType,
): boolean {
  return STRATEGY_POLICY_BY_CATEGORY[category].includes(strategy);
}

export function requiresHumanApproval(strategy: RecoveryStrategyType): boolean {
  return STRATEGY_REQUIRES_HUMAN_APPROVAL[strategy];
}

/**
 * Deterministically narrows `STRATEGY_POLICY_BY_CATEGORY`'s base candidate
 * set for one specific transaction, accounting for risk score,
 * recoverability score, attempt count, retry limits, and known
 * non-retryable conditions — everything the spec calls out beyond the
 * category mapping alone. Always returns a non-empty `allowedStrategies`
 * (falls back to `["manual_review"]` in the worst case) and a single
 * `preferredStrategy`, so both the LLM prompt and the deterministic
 * fallback always have a safe, well-defined candidate set to work from.
 */
export function buildStrategyPolicyContext(input: StrategyInput): StrategyPolicyContext {
  const base = STRATEGY_POLICY_BY_CATEGORY[input.diagnosis.category];
  const constraints: string[] = [];
  let candidates = [...base];

  if (!input.retryable) {
    const before = candidates.length;
    candidates = candidates.filter((s) => !RETRY_BASED_STRATEGIES.has(s));
    if (candidates.length !== before) {
      constraints.push(
        "Retry-based strategies excluded: the diagnosis marks this failure as non-retryable.",
      );
    }
  } else if (input.attemptCount >= STRATEGY_MAX_RETRY_ATTEMPTS) {
    const before = candidates.length;
    candidates = candidates.filter((s) => !RETRY_BASED_STRATEGIES.has(s));
    if (candidates.length !== before) {
      constraints.push(
        `Retry-based strategies excluded: attempt count (${input.attemptCount}) has reached the policy cap of ${STRATEGY_MAX_RETRY_ATTEMPTS}.`,
      );
    }
  }

  if (input.recoverabilityScore < LOW_RECOVERABILITY_FLOOR) {
    candidates = candidates.filter((s) => ESCALATION_STRATEGIES.includes(s));
    constraints.push(
      `Non-escalation strategies excluded: recoverability score (${input.recoverabilityScore}/100) is below the policy floor of ${LOW_RECOVERABILITY_FLOOR}.`,
    );
    if (candidates.length === 0) candidates = ["manual_review"];
  }

  // Only reprioritizes a candidate that already survived every exclusion
  // above — never re-adds one a safety rule (non-retryable, low
  // recoverability, retry cap) deliberately removed.
  if (
    input.hasSucceededWithAlternateMethod === true &&
    candidates.includes("switch_payment_method") &&
    candidates[0] !== "switch_payment_method"
  ) {
    candidates = [
      "switch_payment_method",
      ...candidates.filter((s) => s !== "switch_payment_method"),
    ];
    constraints.push(
      "switch_payment_method prioritized: customer has previously succeeded with a different payment method.",
    );
  }

  if (candidates.length === 0) candidates = ["manual_review"];

  return {
    allowedStrategies: candidates,
    preferredStrategy: candidates[0] ?? "manual_review",
    constraints,
  };
}
