# Deterministic risk scoring

This document describes exactly how `@recoverai/analysis` turns a batch of
ingested transactions into failure classifications, risk scores, and
recovery candidates. Everything here is a fixed, documented rule or
formula — there is no model call, no learned weight, and no randomness.
If two runs are given the same transaction data and the same clock, they
produce byte-identical output.

See also: [`docs/agent-architecture.md`](./agent-architecture.md) for how
this fits into the (not-yet-implemented) agent pipeline, and the root
[README](../README.md) for what is and isn't implemented.

## Pipeline

```text
Transaction Dataset (JSON or CSV)
        |
Ingestion            -- parse the file (packages/analysis/src/ingestion)
        |
Normalization         -- to NormalizedTransaction (Transaction + attemptCount/lastAttemptAt/source)
        |
Validation             -- reject malformed records (Zod), report why
        |
Failure Classification  -- classifyFailure() (packages/analysis/src/classification)
        |
Risk / Recoverability    -- scoreTransaction() (packages/analysis/src/risk)
        |
Prioritization             -- sortCandidates() + priority buckets
        |
Recovery Candidates (RevenueRisk[])
```

Only `failed` and `abandoned` transactions become recovery candidates —
`pending` and `refunded` transactions are excluded (see
`RISK_ELIGIBLE_STATUSES` in `analyze.ts`).

## Failure classification (`classification/failure-classifier.ts`)

Evaluated as a rule cascade, in this order:

1. **No attempts recorded** (`attemptCount === 0`) → `customer_abandoned`.
2. **Duplicate-submission pattern**: two or more attempts on the same
   payment method within 60 seconds of each other → `duplicate_attempt`.
3. **Direct signal**: the transaction's own `failureReasonCode` (from the
   source data's most recent failed attempt, or a flat record's own
   column) → that category, if recognized.
4. **No signal at all** → `unknown`.

Each category has a fixed profile (`description`, `severity`,
`recoverable`, `confidence`) — see `CATEGORY_PROFILES` in
`failure-classifier.ts` for the exact table. `confidence` is a **rule
certainty** score, not a model's self-reported confidence: a directly
observed signal (e.g. `network_timeout` from the latest attempt) scores
0.96; the no-signal fallback (`unknown`) deliberately scores only 0.5.

`evidence` is a short list of the concrete signals used — e.g. `["network_timeout"
signal from the most recent payment attempt", "single failed attempt", "no issuer
decline recorded"]` — so every classification is auditable back to the source data.

## Risk and recoverability (`risk/risk-scorer.ts`)

Both scores are 0–100. They measure **different things** and must not be
conflated:

- **`riskScore`** — how much revenue is at stake and how bad the failure
  is. Independent of whether it can be fixed.
- **`recoverabilityScore`** — how likely that revenue can actually be
  recovered. Independent of how much money is involved.

### `riskScore`

```text
riskScore = round(100 * clamp01(
  0.45 * valueFactor +
  0.35 * severityFactor +
  0.20 * attemptFactor
))
```

| Factor           | Formula                                               | Notes                                                                                 |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `valueFactor`    | `amount / HIGH_VALUE_ANCHOR_PAISE`, clamped to [0,1]  | `HIGH_VALUE_ANCHOR_PAISE` = ₹50,000. A transaction at or above that saturates to 1.0. |
| `severityFactor` | `low`→0.25, `medium`→0.5, `high`→0.75, `critical`→1.0 | From the failure classification.                                                      |
| `attemptFactor`  | `(attemptCount - 1) / 3`, clamped to [0,1]            | More prior attempts already burned → treated as more urgent.                          |

### `recoverabilityScore`

The formula branches on whether the failure category is retryable
(`failureReason.recoverable`):

```text
# retryable:
recoverabilityScore = round(100 * clamp01(
  0.40 * 1 +                      # retryable at all
  0.25 * customerReliabilityScore +
  0.20 * recencyFactor +
  0.15 * paymentMethodFactor
))

# not retryable (a much lower ceiling — no amount of history fixes an unretryable failure):
recoverabilityScore = round(100 * clamp01(
  0.15 * customerReliabilityScore +
  0.10 * recencyFactor
))
```

| Factor                     | Formula                                                                                               | Notes                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `customerReliabilityScore` | successful / total transactions for this customer **within the ingested batch**                       | Neutral 0.5 when this is the customer's only transaction in the batch. Not persisted across runs. |
| `recencyFactor`            | `1 - daysSinceLastAttempt / 30`, clamped to [0,1]                                                     | Decays to 0 after 30 days.                                                                        |
| `paymentMethodFactor`      | fixed lookup (card 0.9, upi 0.8, netbanking 0.7, wallet 0.6, emi 0.5, bank_transfer 0.5, unknown 0.3) | How retry-friendly the method tends to be — a small adjustment, not a dominant factor.            |

### Expected recovery

```text
expectedRecoveryAmount = round(amount * (recoverabilityScore / 100))
```

An estimate, never a claim that money has actually been recovered — see
the "Estimated Recoverable" labeling in the CLI and dashboard.

### Priority

Evaluated per transaction (not relative to the rest of the batch, so a
transaction's priority doesn't shift depending on what else was ingested
alongside it):

```text
riskScore >= 80 AND recoverabilityScore >= 60  -> CRITICAL
riskScore >= 60 AND recoverabilityScore >= 40  -> HIGH
riskScore >= 35 OR  recoverabilityScore >= 25  -> MEDIUM
otherwise                                       -> LOW
```

### Recommended strategy

A fixed lookup from failure category to `RecoveryStrategyType`
(`STRATEGY_BY_FAILURE_CODE` in `risk-scorer.ts`) — e.g.
`insufficient_funds` → `offer_installments`, `expired_card` →
`switch_payment_method`, `risk_blocked`/`duplicate_attempt` →
`no_action`.

## Prioritization / ranking (`risk/prioritization.ts`)

Candidates are sorted primarily by `expectedRecoveryAmount` (descending —
"what's worth doing first, in money terms"), with `riskScore` and then
`recoverabilityScore` as tie-breakers. `priority` (above) is a separate,
per-transaction attribute — sort order and priority label are related but
not the same thing.

## Worked example

A ₹1,000 transaction that failed with a `network_timeout` on its first
attempt, for a customer with no other transactions in the batch, one day
ago, paid by card:

- `valueFactor` = 100000 / 5000000 = 0.02
- `severityFactor` (medium) = 0.5
- `attemptFactor` = (1-1)/3 = 0
- `riskScore` = round(100 × (0.45×0.02 + 0.35×0.5 + 0.20×0)) = round(100 × 0.184) = **18**
- retryable=true, `customerReliabilityScore` = 0.5 (neutral), `recencyFactor` = 1 - 1/30 ≈ 0.9667, `paymentMethodFactor` (card) = 0.9
- `recoverabilityScore` = round(100 × (0.40×1 + 0.25×0.5 + 0.20×0.9667 + 0.15×0.9)) = round(100 × 0.8533) = **85**
- `expectedRecoveryAmount` = round(1000 × 0.85) = **₹850**
- `priority`: riskScore 18 < 35 and recoverabilityScore 85 ≥ 25 → **MEDIUM**
