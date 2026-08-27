# Agent architecture

This document describes the shape of RecoverAI's agent pipeline as
currently defined in `@recoverai/agents`. **Four of the six stages have
real implementations** — Diagnosis (`GroundedDiagnosisAgent`) and Strategy
Selection (`GroundedStrategyAgent`), both LLM-assisted (Anthropic) with a
deterministic fallback; and Recovery Execution (`SimulatedRecoveryAgent`)
and Verification (`DeterministicVerificationAgent`), both fully
deterministic and **simulation-only** — no LLM involved, no real payment
action, no real money movement. Detection and Prioritization remain
contracts and orchestration wiring only, with no behavior. See the root
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
Detection        DetectionAgent.detect(transaction)              -> AgentOutcome<DetectionResult>   [not implemented]
    │
    ▼
Diagnosis         DiagnosisAgent.diagnose(input: DiagnosisInput)   -> DiagnosisOutcome                 [GroundedDiagnosisAgent]
    │
    ▼
Prioritization     PrioritizationAgent.prioritize(tx, reason)       -> AgentOutcome<RevenueRisk>          [not implemented as an agent — @recoverai/analysis's scoreTransaction() is used directly]
    │
    ▼
Strategy Selection  StrategyAgent.selectStrategy(input: StrategyInput) -> StrategyOutcome                    [GroundedStrategyAgent]
    │
    ▼
Recovery Execution   RecoveryAgent.executeRecovery(request: RecoveryExecutionRequest) -> RecoveryExecutionOutcome  [SimulatedRecoveryAgent]
    │
    ▼
Verification          VerificationAgent.verifyRecovery(result)                          -> RecoveryVerificationOutcome  [DeterministicVerificationAgent]
```

Each stage is a small interface in `packages/agents/src/agents/`.
Detection and Prioritization return the generic `AgentOutcome<T>` wrapper
(typed output plus optional `reasoning`/`confidence`) once real
implementations land. The four implemented stages each have their own
richer, stage-specific outcome type (`DiagnosisOutcome`/`StrategyOutcome`/
`RecoveryExecutionOutcome`/`RecoveryVerificationOutcome`) that additionally
carries execution metadata for the audit trail — see
[Diagnosis and Strategy Selection](#diagnosis-and-strategy-selection-implemented)
and [Recovery Execution and Verification](#recovery-execution-and-verification-implemented-simulation-only)
below.

## Orchestration

`packages/agents/src/orchestration/recovery-pipeline.ts` defines
`RecoveryPipeline`, a thin class that takes one implementation of each
agent interface (constructor-injected — no agent implementation is
hardcoded) and exposes:

```ts
analyze(transaction); // detection
diagnose(transaction); // diagnosis
prioritize(transaction); // prioritization
selectStrategy(transaction); // strategy selection
executeRecovery(action); // recovery execution
verifyRecovery(action); // verification
run(transaction); // the full pipeline, end to end
```

`RecoveryPipeline` contains no reasoning of its own — it only sequences
calls to the injected agents, and every method here still throws
`AgentNotImplementedError`. This is deliberately unchanged even though
four of the six agents now have real implementations: the CLI and
dashboard call those agents directly today (see
`packages/cli/src/services/agent-service.ts`,
`packages/cli/src/services/recover-service.ts`, and
`apps/web/lib/diagnosis.ts`), because wiring the *full* six-stage
orchestration — including Detection and Prioritization, still
unimplemented as agents — is later work, not this phase's scope.

## Relationship to `@recoverai/analysis`

`@recoverai/analysis` (see [`docs/risk-scoring.md`](./risk-scoring.md))
implements a real, deterministic, rule-based pipeline —
`classifyFailure()` and `scoreTransaction()` — whose output the CLI/web
integration points map into `DiagnosisInput`/`StrategyInput` (flat DTOs
defined in `packages/agents`, decoupled from `@recoverai/analysis`'s own
types so `@recoverai/agents` never depends on `@recoverai/analysis` — see
the package-boundary rule below). `PrioritizationAgent` itself still has
no implementation; `scoreTransaction()`'s `RevenueRisk` output is used
directly wherever risk context is needed.

## Design intent

- **No agent is a stub that pretends to work.** A method either does real
  work or throws `AgentNotImplementedError`. There is no fake confidence
  score, no hardcoded "recommended strategy," no placeholder recovery
  amount. Four stages now do real work — see below.
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

## What's next

See the README's [Planned implementation phases](../README.md#12-planned-implementation-phases)
— persistence (a real database) is next, then real (non-simulated)
recovery execution behind a live `RecoveryActionProvider` and an actual
human-approval mechanism, then full dashboard data wiring, then real
Razorpay integration, then evaluation at the real-recovery layer.
