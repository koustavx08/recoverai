# Agent architecture

This document describes the shape of RecoverAI's agent pipeline as
currently defined in `@recoverai/agents`. **No agent behavior is
implemented yet** — this describes contracts and orchestration wiring
only. See the root [README](../README.md#current-project-status) for what
is and isn't implemented across the whole repository.

## Pipeline stages

```text
Transaction
    │
    ▼
Detection        DetectionAgent.detect(transaction)        -> DetectionResult
    │
    ▼
Diagnosis         DiagnosisAgent.diagnose(transaction)       -> FailureReason
    │
    ▼
Prioritization     PrioritizationAgent.prioritize(tx, reason) -> RevenueRisk
    │
    ▼
Strategy Selection  StrategyAgent.selectStrategy(tx, risk)     -> RecoveryStrategy
    │
    ▼
Recovery Execution   RecoveryAgent.executeRecovery(action)       -> RecoveryResult
    │
    ▼
Verification          VerificationAgent.verifyRecovery(action)     -> RecoveryResult
```

Each stage is a small interface in `packages/agents/src/agents/`. Every
method returns an `AgentOutcome<T>` — the typed output plus optional
`reasoning` and `confidence` — so every decision can be persisted as an
`AgentDecision` (`@recoverai/core`) for the audit trail, regardless of
which stage produced it.

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
calls to the injected agents. Until real agents exist, every method throws
`AgentNotImplementedError`.

## Design intent

- **No agent is a stub that pretends to work.** A method either does real
  work or throws `AgentNotImplementedError`. There is no fake confidence
  score, no hardcoded "recommended strategy," no placeholder recovery
  amount.
- **Agents depend on ports, not vendors.** A `RecoveryAgent` implementation
  should depend on `RecoveryActionProvider` (`@recoverai/integrations`),
  not directly on Razorpay or any notification vendor — so it can run
  against the simulator in development and tests.
- **Every decision is auditable.** The `reasoning` and `confidence` fields
  on `AgentOutcome` exist so that once agents are implemented, "why did the
  system do this?" always has an answer that can be persisted and shown to
  a merchant.

## What's next

See the README's [Planned implementation phases](../README.md#11-planned-implementation-phases)
— agent implementation starts with rule-based heuristics against the
simulator (phases 2–3) before any model-backed reasoning is introduced.
