# Agent architecture

This document describes the shape of RecoverAI's agent pipeline as
currently defined in `@recoverai/agents`. **All six stages now have real
implementations.** Detection (`DeterministicDetectionAgent`) and
Prioritization (`DeterministicPrioritizationAgent`) are fully
deterministic — no model, ever. Diagnosis (`GroundedDiagnosisAgent`) and
Strategy Selection (`GroundedStrategyAgent`) are LLM-assisted (Anthropic)
with a deterministic fallback. Recovery Execution
(`SimulatedRecoveryAgent`) and Verification
(`DeterministicVerificationAgent`) are fully deterministic and
**simulation-only** — no LLM involved, no real payment action, no real
money movement. A `RecoveryPipeline` orchestrates all six stages end to
end, and a `BatchRecoveryPipeline` runs it sequentially over a portfolio
of transactions. See the root
[README](../README.md#current-project-status) for what is and isn't
implemented across the whole repository, and
[§8](../README.md#8-agent-architecture) for the FACTS → DETERMINISTIC
INTELLIGENCE → EVIDENCE → GENAI REASONING → STRUCTURED OUTPUT → BOUNDED
RECOMMENDATION pattern the AI-capable agents follow, and the
BOUNDED STRATEGY → EXECUTION POLICY → SIMULATED RECOVERY ACTION →
SIMULATED OUTCOME → VERIFICATION pattern Recovery/Verification follow.

## Pipeline stages

```text
Transaction
    │
    ▼
Detection           DetectionAgent.detect(input: DetectionInput)         -> DetectionOutcome           [DeterministicDetectionAgent]
    │
    ▼
Prioritization       PrioritizationAgent.prioritize(input: PrioritizationInput) -> PrioritizationOutcome    [DeterministicPrioritizationAgent]
    │
    ▼
Diagnosis             DiagnosisAgent.diagnose(input: DiagnosisInput)       -> DiagnosisOutcome              [GroundedDiagnosisAgent]
    │
    ▼
Strategy Selection     StrategyAgent.selectStrategy(input: StrategyInput)   -> StrategyOutcome               [GroundedStrategyAgent]
    │
    ▼
Recovery Execution      RecoveryAgent.executeRecovery(request: RecoveryExecutionRequest) -> RecoveryExecutionOutcome  [SimulatedRecoveryAgent]
    │
    ▼
Verification              VerificationAgent.verifyRecovery(result)          -> RecoveryVerificationOutcome  [DeterministicVerificationAgent]
```

Each stage is a small interface in `packages/agents/src/agents/`. Every
stage now has its own concrete, stage-specific outcome type
(`DetectionOutcome`/`PrioritizationOutcome`/`DiagnosisOutcome`/
`StrategyOutcome`/`RecoveryExecutionOutcome`/`RecoveryVerificationOutcome`)
that carries execution metadata (at minimum `latencyMs`; the AI-capable
stages add `mode`/`provider`/`model`) for the audit trail — see
[Detection and Prioritization](#detection-and-prioritization-deterministic-no-model),
[Diagnosis and Strategy Selection](#diagnosis-and-strategy-selection-implemented)
and [Recovery Execution and Verification](#recovery-execution-and-verification-implemented-simulation-only)
below.

**Note on ordering:** the diagram above lists stages in their conceptual
order, but `RecoveryPipeline.run()` actually runs Detection and
Prioritization *before* Diagnosis and Strategy Selection. Both Detection
and Prioritization are cheap, deterministic, and need only classification/
risk-scoring facts the caller already computed; Diagnosis and Strategy
benefit from having the transaction's priority already known (it's part
of the evidence/context an LLM call can reason about), and there is no
reason to pay for or wait on an LLM call before the deterministic gating
stages have had a chance to skip or block the transaction outright. This
is a deliberate implementation choice, not a deviation from intent.

## Orchestration

`packages/agents/src/orchestration/recovery-pipeline.ts` defines
`RecoveryPipeline`, a class that takes one implementation of each agent
interface (constructor-injected — no agent implementation is hardcoded)
plus a shared `AgentContext`, and exposes a single entry point:

```ts
run(facts: PipelineTransactionFacts): Promise<PipelineResult>;
```

`PipelineTransactionFacts` is a flat, caller-supplied DTO (transaction id,
status, amount, payment method, attempt count, plus already-computed
failure/risk context: `failureCode`, `retryable`, `riskScore`,
`recoverabilityScore`, `expectedRecoveryAmount`, `priority`,
`customerHistory`). The CLI (`packages/cli/src/services/
pipeline-context.ts`) and the web dashboard build it by running
`@recoverai/analysis`'s `classifyFailure()`/`scoreTransaction()` first —
`RecoveryPipeline` itself never imports `@recoverai/analysis` (see the
package-boundary rule below); it only threads the facts it's given, plus
each prior stage's own output, into the next stage's typed input via
private mapper methods.

`RecoveryPipeline` contains no reasoning of its own — it only sequences
calls to the injected agents and derives a bounded `PipelineStatus`
(`completed | blocked | skipped | failed`) from what they returned:

- **Detection** finds the transaction not `detected` (e.g. already
  `succeeded`) or not `actionable` (e.g. non-retryable, retry limit
  reached) → the pipeline stops immediately with `skipped` or `blocked`
  and every later stage is left `undefined` in the result.
- Otherwise Prioritization → Diagnosis → Strategy → Recovery Execution →
  Verification run in sequence. The final status is derived from the
  execution outcome and verification result: `not_executed` → `skipped`;
  `blocked`/`pending` → `blocked`; verification failed → `failed`;
  otherwise → `completed`.
- **`RecoveryPipeline` never throws for an expected business outcome.**
  Every stop condition above becomes a `PipelineResult` with a `status`
  and a `statusReason`, not an exception. If an internal stage genuinely
  errors (e.g. a caller supplied facts missing required risk context —
  a contract violation, not a business outcome), the pipeline catches it
  and still returns a `PipelineResult` with `status: "failed"` rather than
  propagating — this is what keeps `BatchRecoveryPipeline` resilient to
  one bad transaction in a portfolio run.

`packages/agents/src/orchestration/batch-recovery-pipeline.ts` defines
`BatchRecoveryPipeline`, which wraps one `RecoveryPipeline` instance and
runs `run()` **sequentially** (no uncontrolled parallelism, deterministic
ordering) over a `PipelineTransactionFacts[]`, returning a
`BatchPipelineResult` (`total`/`completed`/`blocked`/`skipped`/`failed`,
the full `results` array, and aggregate `metrics`).
`packages/agents/src/orchestration/portfolio-metrics.ts` computes those
metrics purely from the `PipelineResult[]` — status counts, priority/
diagnosis/strategy/execution distributions, `revenueAtRisk`,
`simulatedRecoveredAmount`, `simulationRecoveryRate`, and verification
pass/fail counts. **`simulatedRecoveredAmount` is named and typed
distinctly from any notion of a real recovered amount — there is no
`realRecoveredAmount` anywhere in this codebase.**

Both are exercised end to end by `recoverai pipeline run` (single-
transaction and `--file` batch modes — see the CLI section of the root
README) and by the `/recovery` portfolio dashboard
(`apps/web/lib/pipeline.ts`, `apps/web/app/recovery/page.tsx`).

## Relationship to `@recoverai/analysis`

`@recoverai/analysis` (see [`docs/risk-scoring.md`](./risk-scoring.md))
implements a real, deterministic, rule-based pipeline —
`classifyFailure()` and `scoreTransaction()` — whose output the CLI/web
integration points map into `PipelineTransactionFacts`/`DiagnosisInput`/
`StrategyInput` (flat DTOs defined in `packages/agents`, decoupled from
`@recoverai/analysis`'s own types so `@recoverai/agents` never depends on
`@recoverai/analysis` — a hard package-boundary rule enforced throughout
this phase too: `DetectionInput` and `PrioritizationInput` are just as
flat and analysis-free as `DiagnosisInput`/`StrategyInput` always were).

## Design intent

- **No agent is a stub that pretends to work.** A method either does real
  work or throws `AgentNotImplementedError`. There is no fake confidence
  score, no hardcoded "recommended strategy," no placeholder recovery
  amount. All six stages now do real work — see below.
- **Agents depend on ports, not vendors.** `SimulatedRecoveryAgent` depends
  on `RecoverySimulationProvider` (`@recoverai/integrations`), not
  directly on Razorpay or any notification vendor — a future live
  `RecoveryAgent` implementation can depend on the same interface (or
  `RecoveryActionProvider`) so it can be swapped in without changing the
  agent's contract. Likewise, `GroundedDiagnosisAgent`/
  `GroundedStrategyAgent` depend only on `AIModelProvider`
  (`@recoverai/integrations`) — never on the Anthropic SDK, Next.js,
  React, or a CLI framework directly.
- **Every decision is auditable.** Every implemented agent returns
  execution metadata for its stage (`mode`/`provider`/`model` for the
  AI-capable ones; `latencyMs`/`simulationMode` for Recovery/Verification)
  that the CLI and dashboard persist as an `AuditEvent`, so "why did the
  system do this, and was it AI, deterministic, or simulated?" always has
  an answer.
- **Execution stays deterministic and policy-controlled, even with an LLM
  upstream.** The chain from an LLM-influenced `StrategyDecision` to an
  actual (simulated) action always passes through
  `RecoveryExecutionPolicy.canExecute()` first — an LLM can influence
  *which bounded strategy* gets selected, but it never controls whether an
  action executes, what action runs, or what the simulated outcome is.
  `LLM → arbitrary API call → money movement` is not a path that exists in
  this codebase.

## Detection and Prioritization (deterministic, no model)

Both are pure, fully deterministic stages — no LLM involved under any
configuration, ever.

- **`DeterministicDetectionAgent`** (`packages/agents/src/detection/`) —
  `detect(input: DetectionInput): Promise<DetectionOutcome>`. Produces a
  bounded `DetectionResult` (`detected`, `actionable`, `reason`,
  `severity` ∈ `critical|high|medium|low|none`). `succeeded`/`pending`
  transactions are `detected: false` (nothing to act on); `refunded` is
  `detected: true, actionable: false`; a failure marked non-retryable, or
  one that has already reached the retry cap (`DETECTION_RETRY_CAP`), is
  `detected: true, actionable: false` (blocked); everything else
  actionable is graded into a severity purely from transaction amount.
- **`DeterministicPrioritizationAgent`** (`packages/agents/src/
  prioritization/`) — `prioritize(input: PrioritizationInput):
  Promise<PrioritizationOutcome>`. Produces a bounded
  `PrioritizationResult` (`priority` ∈ `critical|high|medium|low`, an
  internal `score` in `[0, 100]`, a `factors` list, and a deterministic
  `explanation` string built from those factors). It does **not**
  recompute `priority` itself — the caller (ultimately
  `@recoverai/analysis`'s `scoreTransaction()`) already derived the
  priority tier from risk/recoverability; this stage packages that
  decision with amount, retry, and customer-history factors for the audit
  trail, rather than re-deriving business logic that already lives in
  `@recoverai/analysis`.
- Both are evaluated as part of the full pipeline:
  `data/evaluation/pipeline-cases.json` / `pnpm evaluate:pipeline` (see
  below) — there is no separate per-stage evaluation harness for
  Detection/Prioritization since they have no branching behavior worth
  evaluating in isolation from the pipeline that calls them.

## Diagnosis and Strategy Selection (implemented)

Both follow the same shape:

```text
FACTS  (deterministic — from @recoverai/analysis's classification/risk scoring)
  → DETERMINISTIC INTELLIGENCE  (packages/agents/src/diagnosis/facts.ts, strategy/policy.ts)
  → EVIDENCE  (fixed-id EvidenceItem[] bundle — never authored by a model)
  → GENAI REASONING  (optional — only when AI_API_KEY/AI_MODEL are configured)
  → STRUCTURED, ZOD-VALIDATED OUTPUT  (Diagnosis / StrategyDecision)
  → BOUNDED RECOMMENDATION  (never an executed action)
```

- **`GroundedDiagnosisAgent`** (`packages/agents/src/diagnosis/`) —
  `diagnose(input: DiagnosisInput): Promise<DiagnosisOutcome>`. Bounded
  `DiagnosisCategory` (11 values, incl. `insufficient_evidence` and
  `non_retryable`), bounded `InterventionType` (7 values), confidence in
  `[0, 1]`. The model may only cite evidence by an `id` from the bundle it
  was given; any response that cites an unknown id, mismatches the
  transaction id, or recommends `RETRY` against a non-retryable failure is
  rejected and the agent falls back deterministically.
- **`GroundedStrategyAgent`** (`packages/agents/src/strategy/`) —
  `selectStrategy(input: StrategyInput): Promise<StrategyOutcome>`, where
  `StrategyInput` carries the already-produced `Diagnosis` plus
  deterministic risk context (never the raw transaction — Strategy sits
  strictly downstream of Diagnosis). `StrategyPolicy`
  (`policy.ts`) narrows `RecoveryStrategyType` (core's bounded enum) to a
  category-specific, risk-adjusted candidate set *before* any model call —
  the model can only choose from that set, never the full enum, and never
  a strategy the policy has excluded (e.g. a retry against a non-retryable
  failure, or anything beyond escalation once recoverability is very low).
  `requiresHumanApproval` is always computed deterministically from the
  chosen strategy, never taken from the model.
- Both have a deterministic fallback (`deterministic-diagnosis.ts` /
  `deterministic-strategy.ts`) that runs whenever no AI provider is
  configured, a provider call throws, or the response fails schema,
  evidence-grounding, or policy validation — it never claims to be an LLM
  result (`metadata.mode` is always accurate).
- Both are evaluated against synthetic ground-truth cases:
  `data/evaluation/diagnosis-cases.json` / `pnpm evaluate:diagnosis` and
  `data/evaluation/strategy-cases.json` / `pnpm evaluate:strategy` —
  results are always computed from an actual run, never hardcoded.

## Recovery Execution and Verification (implemented, simulation-only)

```text
BOUNDED STRATEGY  (StrategyDecision — already validated, never re-derived here)
  → EXECUTION POLICY  (packages/agents/src/recovery/policy.ts — canExecute())
  → SIMULATED RECOVERY ACTION  (RecoveryExecutionSimulator, @recoverai/integrations —
      pure, seeded computation; never contacts Razorpay/a bank/a UPI provider/a customer)
  → SIMULATED OUTCOME  (RecoveryExecutionResult — outcome ∈ {success, failure,
      pending, blocked, not_executed}; simulationMode: true, always)
  → VERIFICATION  (packages/agents/src/recovery/deterministic-verification.ts —
      independent internal-consistency check, never trusts the execution's own report)
  → AUDIT TRAIL  (AuditEvent: recovery_action_executed, recovery_verified)
```

- **`SimulatedRecoveryAgent`** (`packages/agents/src/recovery/
  simulated-recovery-agent.ts`) — `executeRecovery(request:
  RecoveryExecutionRequest): Promise<RecoveryExecutionOutcome>`. No LLM
  involved; the strategy was already chosen upstream (by
  `GroundedStrategyAgent`, itself already policy-bounded) — this agent
  only ever decides *whether and how* to (simulate) carrying it out.
- **`RecoveryExecutionPolicy.canExecute()`** (`policy.ts`) is the single
  gate: `manual_review` is always blocked (it defers to a human, it isn't
  an action); a non-retryable diagnosis or a reached retry limit
  (`RECOVERY_MAX_RETRY_ATTEMPTS`) blocks any retry-based action
  (`auto_retry`); a strategy that `requiresHumanApproval` is allowed to
  build a plan but resolves as `pending` rather than being simulated to
  success/failure, since no automated approval mechanism exists yet.
  Returns either an allowed `RecoveryExecutionPlan` or a blocked reason —
  `SimulatedRecoveryAgent` never overrides this.
- **`action-mapping.ts`** deterministically maps the bounded
  `RecoveryStrategyType` to the bounded `RecoveryActionType` (both
  `@recoverai/core`, both closed enums) — Strategy ≠ Action: a strategy is
  a decision, an action is its bounded implementation kind. Nothing,
  including an LLM, picks an action directly.
- **`simulation-profile.ts`** computes a deterministic, explainable
  `probabilityOfSuccess` (with a `factors` list) from diagnosis category,
  strategy, recoverability score, prior attempts, alternate-payment-method
  history, and transaction value — always labeled a "simulation estimate,"
  never a real-world prediction. `RecoveryExecutionSimulator` then draws a
  seeded `[0, 1)` value (`seededFloat`, shared with the pre-existing
  `PaymentSimulator`/`RecoveryActionSimulator`) against it — same
  transaction + strategy + seed always reproduces the same result.
- On success, `recoveredAmount` is set to the deterministic
  `expectedRecoveryAmount` already established by risk-scoring; every
  other outcome forces `recoveredAmount` to zero — never an arbitrary
  value.
- **`DeterministicVerificationAgent`** (`deterministic-verification-
  agent.ts`, wrapping the pure `verifyRecoveryExecution()`) — independently
  re-checks internal consistency: outcome/amount agreement, `blockedReason`
  present iff `outcome === "blocked"`, `simulationMode === true`. No model,
  no dependency on whatever code produced the result.
- Evaluated against synthetic ground-truth cases:
  `data/evaluation/recovery-cases.json` / `pnpm evaluate:recovery` —
  policy allow/block correctness, execution-result validity, verification
  pass rate, and same-seed simulation consistency, all computed from an
  actual run.

## Full pipeline and batch orchestration (implemented)

`data/evaluation/pipeline-cases.json` (50 synthetic cases) /
`pnpm evaluate:pipeline` runs the real, complete `RecoveryPipeline` end to
end for every case (no hand-constructed intermediate stage output) and
reports pipeline-status accuracy against each case's
`expectedPipelineStatus`, policy violations, invalid stage outputs (each
present stage's output is validated against its own Zod schema), and
same-seed simulation consistency (every case is run twice with the same
seed and must produce identical results). This is the only evaluation
harness that exercises Detection and Prioritization, since their
behavior is only meaningful in the context of the full pipeline they
gate.

`BatchRecoveryPipeline` and `computePortfolioMetrics()` are additionally
covered by unit tests (`orchestration/batch-recovery-pipeline.test.ts`)
that assert deterministic aggregation, mixed-outcome batches, and that
`simulationRecoveryRate` stays arithmetically consistent with
`revenueAtRisk`/`simulatedRecoveredAmount`. The CLI's
`recoverai pipeline run --file <transactions.json>` has been verified
against a 10,000-transaction generated dataset
(`data/generated/transactions.json`) completing in roughly 7 seconds with
all verifications passing, confirming the sequential batch design scales
without needing concurrency.

## What's next

See the README's [Planned implementation phases](../README.md#12-planned-implementation-phases)
— persistence (a real database) is next, then real (non-simulated)
recovery execution behind a live `RecoveryActionProvider` and an actual
human-approval mechanism, then full dashboard data wiring, then real
Razorpay integration, then evaluation at the real-recovery layer.
