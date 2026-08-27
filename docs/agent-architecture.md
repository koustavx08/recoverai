# Agent architecture

This document describes the shape of RecoverAI's agent pipeline as
currently defined in `@recoverai/agents`. **Two of the six stages have
real implementations** — Diagnosis (`GroundedDiagnosisAgent`) and Strategy
Selection (`GroundedStrategyAgent`), both LLM-assisted (Anthropic) with a
deterministic fallback; the rest are still contracts and orchestration
wiring only, with no behavior. See the root
[README](../README.md#current-project-status) for what is and isn't
implemented across the whole repository, and
[§8](../README.md#8-agent-architecture) for the FACTS → DETERMINISTIC
INTELLIGENCE → EVIDENCE → GENAI REASONING → STRUCTURED OUTPUT → BOUNDED
RECOMMENDATION pattern both implemented agents follow.

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
Recovery Execution   RecoveryAgent.executeRecovery(action)               -> AgentOutcome<RecoveryResult>       [not implemented]
    │
    ▼
Verification          VerificationAgent.verifyRecovery(action)             -> AgentOutcome<RecoveryResult>       [not implemented]
```

Each stage is a small interface in `packages/agents/src/agents/`. The
three not-yet-implemented stages return the generic `AgentOutcome<T>`
wrapper (typed output plus optional `reasoning`/`confidence`) once real
implementations land. `DiagnosisAgent` and `StrategyAgent` have their own
richer, stage-specific outcome types (`DiagnosisOutcome`/
`StrategyOutcome`) that additionally carry execution metadata (`mode`,
`provider`, `model`, `latencyMs`, `validationSuccess`, `fallbackUsed`) for
the audit trail — see [Diagnosis and Strategy Selection](#diagnosis-and-strategy-selection-implemented)
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
`GroundedDiagnosisAgent`/`GroundedStrategyAgent` now exist: the CLI and
dashboard call those agents directly today (see
`packages/cli/src/services/agent-service.ts` and
`apps/web/lib/diagnosis.ts`), because wiring the *full* six-stage
orchestration — including the two still-unimplemented stages either side
of it — is later work, not this phase's scope.

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
  amount. `GroundedDiagnosisAgent` and `GroundedStrategyAgent` are the
  first two stages to do real work — see below.
- **Agents depend on ports, not vendors.** A `RecoveryAgent` implementation
  should depend on `RecoveryActionProvider` (`@recoverai/integrations`),
  not directly on Razorpay or any notification vendor — so it can run
  against the simulator in development and tests. Likewise,
  `GroundedDiagnosisAgent`/`GroundedStrategyAgent` depend only on
  `AIModelProvider` (`@recoverai/integrations`) — never on the Anthropic
  SDK, Next.js, React, or a CLI framework directly.
- **Every decision is auditable.** Both implemented agents return
  execution metadata (`mode`, `provider`, `model`, `latencyMs`,
  `validationSuccess`, `fallbackUsed`/`fallbackReason`, token counts) that
  the CLI and dashboard persist as an `AuditEvent`, so "why did the system
  do this, and was it AI or deterministic?" always has an answer.

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

## What's next

See the README's [Planned implementation phases](../README.md#12-planned-implementation-phases)
— recovery execution (`RecoveryAgent`, against the simulator first) and
verification (`VerificationAgent`) are next, followed by wiring
`RecoveryPipeline.run()` end to end.
