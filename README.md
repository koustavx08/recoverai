# RecoverAI

**AI-powered revenue recovery infrastructure for merchants.**

> **Status: a complete, closed-loop, six-stage recovery pipeline — for one
> transaction or a batch of thousands — with every recovery outcome and
> every portfolio metric explicitly SIMULATED. No real payment action, no
> real Razorpay call, no real money movement, anywhere in this repo.** The
> CLI genuinely ingests transaction data (JSON or CSV), classifies why
> payments failed, and scores revenue risk/recoverability with fixed,
> documented rules. A deterministic Detection stage decides what's worth
> pursuing; a deterministic Prioritization stage explains how urgently; a
> real Diagnosis Agent and a real Strategy Agent (both LLM-assisted via
> Anthropic when `AI_API_KEY`/`AI_MODEL` are set, with a deterministic
> fallback otherwise) produce structured, evidence-grounded, policy-bounded
> output; a real, fully deterministic Recovery Agent turns a bounded
> strategy into a policy-checked, seeded **simulation** — never a live
> execution — and an independent Verification Agent re-checks the result
> before anything is recorded. `RecoveryPipeline` now orchestrates all six
> stages end to end — for one transaction (`recoverai pipeline run
> --transaction <id>`) or a full batch (`recoverai pipeline run --file
> <file>`), aggregating portfolio-level metrics. See
> [§8](#8-agent-architecture). Every simulated recovery is explicitly
> labeled `SIMULATED`/`simulationMode: true`; nothing in this repo claims
> real recovered revenue. See
> [Current project status](#current-project-status) before assuming any
> feature works end to end.

## 1. What RecoverAI is

RecoverAI is a platform that helps merchants recover revenue lost to failed
or abandoned payments. When a charge fails — a card is declined, a UPI
request times out, a customer abandons checkout — that revenue isn't
necessarily gone. Some of it is recoverable: a retry, a payment link, a
different payment method, a well-timed follow-up.

RecoverAI's job is to:

1. **Detect** transactions that represent revenue at risk.
2. **Diagnose** why the payment failed.
3. **Prioritize** which failures are worth acting on and how urgently.
4. **Select a strategy** most likely to recover the transaction.
5. **Execute** a bounded recovery action.
6. **Verify** whether the action actually recovered the revenue.
7. **Record everything** in an immutable audit trail.

## 2. The problem it solves

Payment failures are routine at any scale, but most merchants have no
systematic way to triage them: which failures are worth pursuing, what the
right recovery action is, and whether attempted recoveries actually worked.
RecoverAI is designed to be that system — an infrastructure layer that sits
between "a payment failed" and "someone (or something) should try to
recover it," with every decision explainable and every action audited.

## 3. High-level architecture

```
                         ┌─────────────────────┐
                         │   apps/web (Next.js) │  merchant dashboard
                         └──────────┬───────────┘                (dashboard reads live analysis)
                                    │
                         ┌──────────┴───────────┐
                         │   packages/cli        │  developer-facing CLI
                         └──────────┬───────────┘
                                    │  command → service → core
              ┌─────────────────────┼─────────────────────┬─────────────────────┐
              │                     │                     │                     │
   ┌──────────┴─────────┐ ┌─────────┴─────────┐ ┌─────────┴─────────┐ ┌─────────┴─────────┐
   │  packages/agents     │ │ packages/analysis   │ │ packages/database  │ │ packages/integrations│
   │  detection→diagnosis  │ │ ingest → normalize →│ │ repository ports    │ │ PaymentProvider,     │
   │  →prioritization→     │ │ classify → score →   │ │ + in-memory impl    │ │ RecoveryActionProvider│
   │  strategy→recovery→   │ │ prioritize (real,     │ │                     │ │ + simulator/Razorpay  │
   │  verification (stubs) │ │ deterministic, no AI)  │ │                     │ │                       │
   └──────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
              │                     │                     │                     │
              └─────────────────────┴─────────────────────┴─────────────────────┘
                                    │
                         ┌──────────┴───────────┐
                         │   packages/core        │  framework-independent
                         │   domain models & ports │  domain layer
                         └────────────────────────┘

                         packages/config — typed, Zod-validated env config
                         used by every layer above.
```

**The core invariant:** `packages/core` has no dependency on Next.js,
React, Commander, a database client, or any vendor SDK. Every other package
depends inward on `core`; `core` depends on nothing in this repo.
`packages/analysis` depends only on `core` and `database` — agents will
depend on `analysis`'s output later, not the other way around.

## 4. Repository structure

```text
recoverai/
├── apps/
│   └── web/                # Next.js merchant dashboard (dashboard route reads live analysis)
│       ├── app/             # dashboard, transactions, recovery, audit-log
│       ├── components/      # layout shell + shadcn-style UI primitives
│       └── lib/
│
├── packages/
│   ├── core/                # domain models, enums, repository/system ports
│   ├── config/               # typed env config, validated with Zod
│   ├── cli/                  # `recoverai` CLI (Commander + Zod)
│   │   └── src/{commands,services,utils}
│   ├── analysis/               # ingestion + deterministic risk-scoring pipeline
│   │   └── src/{ingestion,classification,risk}
│   ├── agents/                # Detection→...→Verification agent contracts
│   │   └── src/{agents,orchestration,tools}
│   ├── integrations/           # PaymentProvider / RecoveryActionProvider
│   │   └── src/{interfaces,simulator,razorpay}
│   └── database/                # repository implementations (in-memory today)
│
├── data/
│   ├── samples/                  # hand-authored deterministic fixtures (JSON + CSV)
│   └── generated/                 # output of scripts/generate-sample-data.ts (gitignored)
│
├── docs/                            # docs/risk-scoring.md, docs/agent-architecture.md
├── scripts/                        # generate-sample-data.ts
├── tests/                           # cross-package/integration tests
├── .env.example
└── pnpm-workspace.yaml
```

`packages/cli`, `packages/analysis`, `packages/agents`, and `apps/web` all
depend on `core` for types — none of them define their own copies of
`Transaction`, `RevenueRisk`, etc.

## 5. Technology stack

| Area         | Choice                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| Language     | TypeScript, strict mode, everywhere                                          |
| Package mgmt | pnpm workspaces                                                              |
| Web          | Next.js 15 (App Router), Tailwind CSS, shadcn-style primitives, lucide-react |
| CLI          | Commander.js, Zod, `tsx` for dev                                             |
| Validation   | Zod (CLI options, environment config)                                        |
| Testing      | Vitest                                                                       |
| Lint/format  | ESLint (flat config) + `eslint-config-next` for the web app, Prettier        |

## 6. CLI vision

```text
recoverai init       # scaffold local project configuration          [not implemented]
recoverai ingest     # load transaction data (JSON/CSV) into the store [implemented]
recoverai analyze    # run the deterministic risk-analysis pipeline    [implemented]
recoverai simulate   # exercise the pipeline via the payment simulator [not implemented]
recoverai recover    # run a SIMULATED recovery execution               [implemented — simulation only]
recoverai report     # generate a merchant-facing recovery report      [not implemented]
recoverai agent      # run/inspect a single agent pipeline stage       [diagnosis, strategy implemented]
recoverai pipeline   # run the full 6-stage pipeline (single or batch)  [implemented — simulation only]
```

Every command follows the same layering: **CLI command → service → core
domain**. Command handlers in `packages/cli/src/commands` only parse and
validate input (via Zod) and print results — they never contain business
logic. That logic belongs in a service (`packages/cli/src/services`),
which calls into `packages/analysis` (for `ingest`/`analyze`), and into
`packages/agents`/`packages/integrations` for `agent` and `recover`.

```bash
recoverai ingest --file data/samples/transactions.json
recoverai ingest --file data/samples/transactions.csv
recoverai analyze                                  # defaults to the bundled sample dataset
recoverai analyze --file data/generated/transactions.json --json

recoverai agent --stage diagnosis --transaction txn_00002
recoverai agent --stage strategy  --transaction txn_00002 --json

recoverai recover --transaction txn_00002           # SIMULATED recovery execution — never live
recoverai recover --transaction txn_00002 --seed abc --json
recoverai recover --transaction txn_00002 --live    # rejected — no live execution path exists

recoverai pipeline run --transaction txn_00002       # full 6-stage pipeline for one transaction
recoverai pipeline run --file data/samples/transactions.json   # batch mode — every transaction in the file
recoverai pipeline run --file data/generated/transactions.json --seed abc --json
```

`ingest`, `analyze`, `agent`, `recover`, and `pipeline` each start from a
fresh in-memory store per invocation — see
[Current project status](#current-project-status) for why there's no
cross-process persistence yet. `init`, `simulate`, `report`, and every
`agent` stage other than `diagnosis`/`strategy` still validate their
arguments for real but return "Not implemented yet." for the actual
operation. `recover` and `pipeline` always run in simulation mode;
`recover --live` is rejected outright rather than silently ignored —
there is no hidden live-execution path anywhere in this codebase.
`pipeline run` runs in **batch mode over every transaction in the file**
whenever `--transaction` is omitted — this is the one command that
processes a whole file's worth of transactions in one invocation.

## 7. Transaction intelligence (deterministic, not AI)

`@recoverai/analysis` implements the pipeline described in
[`docs/risk-scoring.md`](./docs/risk-scoring.md):

```text
Ingestion → Normalization → Validation → Failure Classification
   → Risk / Recoverability Scoring → Prioritization → Recovery Candidates
```

Every number is computed by a fixed, documented rule or formula — there is
no model call anywhere in this package, and `confidence` on a
classification means "how directly the evidence maps to this category,"
never a model's self-reported confidence. `riskScore` (how much revenue
is at stake) and `recoverabilityScore` (how likely it can be recovered)
are deliberately separate metrics — see the doc for the exact weights.
`expectedRecoveryAmount` is a projection (`amount × recoverabilityScore`),
labeled as an estimate everywhere it's shown; nothing in this repo claims
revenue has actually been recovered.

## 8. Agent architecture

```text
Transaction
    │
    ▼
Detection        — is this transaction revenue at risk, and worth pursuing now? [implemented — DeterministicDetectionAgent]
    │
    ▼
Prioritization    — how much is at stake, how urgently, and why?               [implemented — DeterministicPrioritizationAgent]
    │
    ▼
Diagnosis         — why did it fail, and is it recoverable?                     [implemented — GroundedDiagnosisAgent]
    │
    ▼
Strategy Selection — what should we try?                                          [implemented — GroundedStrategyAgent]
    │
    ▼
Recovery Execution — do it, in SIMULATION only                                     [implemented — SimulatedRecoveryAgent]
    │
    ▼
Verification       — did the simulated attempt look internally valid?               [implemented — DeterministicVerificationAgent]
```

**All six stages are now real, implemented agents** — no stub, no
`AgentNotImplementedError` anywhere in this pipeline. Each stage is defined
as a TypeScript interface in `packages/agents/src/agents` (`DetectionAgent`,
`PrioritizationAgent`, `DiagnosisAgent`, `StrategyAgent`, `RecoveryAgent`,
`VerificationAgent`). `packages/agents/src/orchestration`'s `RecoveryPipeline`
now genuinely wires all six together — `pipeline.run(facts)` threads each
stage's typed output into the next stage's typed input, tracks which
stages actually ran, and returns a structured `PipelineResult` with a
bounded `status` (`completed` | `blocked` | `skipped` | `failed`). It never
throws for an expected business outcome (non-retryable, a retry limit,
`manual_review`, a failed verification) — every one of those becomes a
`PipelineResult` with an explanatory `status`/`statusReason` instead, and
an unexpected internal error is caught and reported the same way rather
than propagating (so one bad transaction never aborts a batch of others).
`BatchRecoveryPipeline` runs the pipeline sequentially over any number of
transactions and aggregates `PortfolioMetrics` (priority/diagnosis/
strategy/execution distributions, revenue at risk, **simulated** recovered
amount, simulation recovery rate, verification pass rate) — see
`recoverai pipeline run` and the `/recovery` dashboard route below.

Detection and Prioritization run *before* Diagnosis in the real pipeline
(cheaply filtering out what doesn't need the more expensive AI-capable
stages) rather than after, as the original six-stage naming might suggest
— Detection needs the deterministic failure classification that already
has to run for every failed/abandoned transaction anyway, and
Prioritization packages the risk score that Diagnosis/Strategy already
depend on. Detection blocks non-retryable failures and exhausted retry
limits *before* they'd otherwise reach Diagnosis's own (separately
testable) handling of the same conditions — both layers agree, by design,
not by accident.

### Recovery Execution: simulation only, by construction

```text
BOUNDED STRATEGY  (a validated StrategyDecision — never re-derived here)
  │
  ▼
EXECUTION POLICY  (packages/agents/src/recovery/policy.ts — canExecute())
  │            narrows to: allowed (with a bounded action + approval flag) or blocked, with a reason
  ▼
SIMULATED RECOVERY ACTION  (packages/integrations' RecoveryExecutionSimulator —
  │                          pure, seeded computation; never contacts Razorpay,
  │                          a bank, a UPI provider, or a customer)
  ▼
SIMULATED OUTCOME  (RecoveryExecutionResult — outcome ∈ {success, failure,
  │                  pending, blocked, not_executed}; simulationMode: true, always)
  ▼
VERIFICATION  (packages/agents/src/recovery/deterministic-verification.ts —
  │             independently re-checks internal consistency, e.g. "success
  │             implies recoveredAmount > 0," never trusting the execution's
  │             own report)
  ▼
AUDIT TRAIL  (AuditEvent: recovery_action_executed, recovery_verified)
```

`RecoveryExecutionPolicy.canExecute()` is the single gate: `manual_review`
is always blocked (it defers to a human, it isn't an action); a
non-retryable diagnosis or a retry limit blocks any retry-based action; a
strategy that `requiresHumanApproval` (e.g. `manual_followup`,
`send_payment_link`, `offer_installments`) is allowed to plan but resolves
as `pending` rather than being simulated to success/failure, since no
automated approval mechanism exists yet. Only once policy has allowed an
action *and* it needs no approval does `RecoveryExecutionSimulator` run —
a deterministic, seeded draw (`seededFloat`, shared with the existing
`PaymentSimulator`/`RecoveryActionSimulator`) against a probability
computed by `simulation-profile.ts` from diagnosis category, strategy,
recoverability score, prior attempts, alternate-payment-method history,
and transaction value — always logged as an explainable `factors` list,
and always labeled a "simulation estimate," never a real-world prediction.
The same transaction + strategy + seed always reproduces the same result.

### Detection and Prioritization: deterministic, no model, no re-derivation

- **`DeterministicDetectionAgent`** (`packages/agents/src/detection/`) —
  a cheap, fully deterministic gate: succeeded/pending transactions are
  `detected: false`; refunded, non-retryable, or retry-limit-exhausted
  ones are `detected: true, actionable: false` (recorded, not pursued);
  everything else is `actionable: true` and proceeds. Severity is graded
  from transaction value alone (`critical`/`high`/`medium`/`low`/`none`).
- **`DeterministicPrioritizationAgent`** (`packages/agents/src/
  prioritization/`) — never recomputes `riskScore`/`recoverabilityScore`/
  `priority` (that's `@recoverai/analysis`'s `scoreTransaction()`'s job,
  reused as-is); it only packages the already-computed priority tier into
  a bounded, explainable `PrioritizationResult` with a deterministic
  `factors` list (transaction value, recoverability, customer history,
  retry headroom) and a plain-language `explanation` — never an LLM.

### Diagnosis and Strategy: the pattern both agents follow

```text
FACTS  (deterministic — @recoverai/analysis classification + risk scoring)
  │
  ▼
DETERMINISTIC INTELLIGENCE  (packages/agents/src/diagnosis/facts.ts, strategy/policy.ts)
  │
  ▼
EVIDENCE  (fixed-id EvidenceItem[] bundle, generated only by deterministic code)
  │
  ▼
GENAI REASONING  (optional — AIModelProvider, only if AI_API_KEY/AI_MODEL are set)
  │
  ▼
STRUCTURED, VALIDATED OUTPUT  (Diagnosis / StrategyDecision — Zod-bounded)
  │
  ▼
BOUNDED RECOMMENDATION  (never an executed action)
```

Never `Raw transaction → LLM → "trust me"`. The deterministic layer always
runs first and establishes the facts, the evidence bundle, and (for
Strategy) the policy-approved candidate set; the model — when configured —
can only reason over what it's given, cite evidence by a fixed `id` it
cannot invent, and choose from a bounded enum it cannot expand. Every LLM
response is re-validated after the fact (evidence grounding, category/
strategy bounds, hard safety constraints like "never retry a non-retryable
failure") — a response that fails validation is discarded, not repaired,
and the agent falls back to a fully deterministic decision that never
pretends to be AI-generated (`metadata.mode` is always accurate). See
`packages/agents/src/diagnosis/` and `packages/agents/src/strategy/` for
the concrete implementations, and `data/evaluation/` +
`pnpm evaluate:diagnosis` / `pnpm evaluate:strategy` for their accuracy
against synthetic ground-truth cases.

**No stage in this pipeline executes anything real.** Detection and
Prioritization only classify and explain; `GroundedDiagnosisAgent.
diagnose()` and `GroundedStrategyAgent.selectStrategy()` only return
structured data; `SimulatedRecoveryAgent.executeRecovery()` only ever runs
a deterministic, seeded simulation (see above). No payment is charged, no
payment link is actually sent, no notification actually goes out, no real
retry is scheduled, anywhere in this repository. See `data/evaluation/`
+ `pnpm evaluate:diagnosis` / `evaluate:strategy` / `evaluate:recovery` /
`evaluate:pipeline` for each layer's accuracy against synthetic
ground-truth cases — the last of these runs the real, complete
`RecoveryPipeline` end to end against 50 cases and checks pipeline-level
status correctness, policy compliance, and same-seed simulation
consistency.

## 9. Local development setup

**Prerequisites:** Node.js ≥ 20, [pnpm](https://pnpm.io) (`npm install -g pnpm`
if you don't have it).

```bash
# install dependencies for every workspace package
pnpm install

# build every package (required before running the CLI's built bin)
pnpm build

# type-check, lint, test
pnpm typecheck
pnpm lint
pnpm test

# run the web dashboard
pnpm dev:web        # http://localhost:3000

# run the CLI
pnpm recoverai --help
pnpm dev:cli -- analyze --json     # run the CLI from source via tsx, no build needed

# generate a larger, still-deterministic synthetic dataset (JSON + CSV)
pnpm generate:data -- --count 10000 --seed 42
pnpm recoverai analyze --file data/generated/transactions.json
```

## 10. Environment variables

See [`.env.example`](./.env.example) for the full, commented list. Copy it
to `.env` and fill in only what you need — **the simulator provider
requires no credentials at all**, which is the default.

| Variable                                  | Required when                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | `NODE_ENV=production` (unused while `packages/database` only has an in-memory store) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | `PAYMENT_PROVIDER=razorpay`                                                          |
| `AI_API_KEY` / `AI_MODEL`                 | `NODE_ENV=production`; optional otherwise — unset means the Diagnosis/Strategy agents run their deterministic fallback |
| `NEXT_PUBLIC_APP_URL`                     | always (defaults to `http://localhost:3000`)                                         |

Configuration is loaded and validated once, at process startup, via
`@recoverai/config`'s `loadConfig()` (Zod-backed). Missing required
production configuration throws a `ConfigValidationError` listing every
problem — it does not fail silently or fall back to defaults in production.

## 11. Current project status

**Implemented:**

- Monorepo structure, strict TypeScript config, ESLint, Prettier.
- `@recoverai/core`: domain models, enums, and repository/system ports.
- `@recoverai/config`: typed, Zod-validated environment configuration.
- `@recoverai/database`: repository interfaces + an in-memory implementation
  (now including `findAll()`, used by batch analysis).
- `@recoverai/analysis` **(new)**: a real, deterministic pipeline —
  ingest JSON or CSV, validate and normalize records, classify why a
  payment failed, score risk/recoverability, and rank recovery candidates.
  No model calls; see [`docs/risk-scoring.md`](./docs/risk-scoring.md) for
  the exact rules.
- `@recoverai/integrations`: `PaymentProvider` / `RecoveryActionProvider`
  abstractions, a deterministic simulator implementation (no credentials
  required), an unimplemented Razorpay stub, and **`AIModelProvider`** — a
  vendor-agnostic `generateStructured<T>()` contract with one real
  implementation, `AnthropicProvider` (forces tool-based structured output,
  validates it against the caller's own Zod schema before returning; no
  free-form prose parsing).
- `@recoverai/agents`: interfaces for all six pipeline stages, **all six
  now with real implementations**, plus `RecoveryPipeline` — a real
  orchestrator that wires them together end to end — and
  `BatchRecoveryPipeline`, which runs it sequentially over any number of
  transactions and aggregates portfolio metrics:
  - **`DeterministicDetectionAgent`** (`packages/agents/src/detection/`) —
    a cheap, deterministic gate deciding whether a transaction is a
    revenue-risk event worth pursuing now. No model.
  - **`DeterministicPrioritizationAgent`** (`packages/agents/src/
    prioritization/`) — explains and packages the already-computed
    deterministic risk/priority signal into a bounded, auditable result
    with a factor list. Never re-derives the underlying score. No model.
  - **`GroundedDiagnosisAgent`** (`packages/agents/src/diagnosis/`) —
    grounded, evidence-cited, LLM-assisted diagnosis with a deterministic
    fallback. See [§8](#8-agent-architecture).
  - **`GroundedStrategyAgent`** (`packages/agents/src/strategy/`) — takes a
    `Diagnosis` + deterministic risk context, narrows the strategy
    candidate set through an explicit `StrategyPolicy` *before* any model
    ever sees it, and returns a bounded `StrategyDecision` — never an
    executed action. `requiresHumanApproval` is always computed
    deterministically, never trusted from the model.
  - **`SimulatedRecoveryAgent`** (`packages/agents/src/recovery/`) — turns a
    validated `StrategyDecision` into a policy-checked, **SIMULATED**
    execution: `RecoveryExecutionPolicy.canExecute()` gates everything
    (non-retryable, retry limits, `manual_review` always blocked,
    approval-required strategies resolve as `pending`), a deterministic
    strategy→action mapping (`RecoveryStrategyType → RecoveryActionType`,
    both bounded, `@recoverai/core`) decides the concrete action, and only
    a policy-allowed, non-approval action ever reaches
    `RecoveryExecutionSimulator` (`@recoverai/integrations`) — pure, seeded
    computation that never contacts Razorpay, a bank, a UPI provider, or a
    customer. No LLM involved; fully deterministic.
  - **`DeterministicVerificationAgent`** (`packages/agents/src/recovery/`) —
    independently re-checks a `RecoveryExecutionResult` for internal
    consistency (e.g. "success ⟹ recoveredAmount > 0," "blocked ⟹ zero
    amount + a reason," "simulationMode must be true") — never trusting
    the recovery agent's own report, never using a model.
- `@recoverai/config`: adds `AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL`;
  `config.ai.isConfigured` is true only once both a key and model are set,
  so agents can tell "no AI configured" apart from "AI configured but
  failed" without ever hardcoding credentials.
- `@recoverai/cli`: all eight commands registered. **`ingest`, `analyze`,
  `agent --stage diagnosis|strategy`, `recover`, and `pipeline run` are
  fully functional** (real ingestion, real classification, real risk
  scoring, real detection/prioritization/diagnosis/strategy selection,
  real policy-checked SIMULATED recovery execution + independent
  verification — see [§7](#7-transaction-intelligence-deterministic-not-ai)
  and [§8](#8-agent-architecture)). `pipeline run --transaction <id>` runs
  the full six-stage pipeline for one transaction; omitting `--transaction`
  runs it in **batch mode** over every transaction in the file (verified
  at 10,000 transactions in ~7 seconds, fully deterministic, every
  verification passing). `recover`/`pipeline` always run in simulation
  mode; `recover --live` is rejected outright, not silently ignored —
  there is no hidden live-execution path. `init`, `simulate`, `report`,
  and every other `agent` stage still return "Not implemented yet."
- `apps/web`: the `/dashboard` route renders real numbers (GMV, revenue at
  risk, estimated recoverable, failure breakdown, top opportunities)
  computed server-side via `@recoverai/analysis`, linking through to
  `/dashboard/diagnosis/[transactionId]` — a real, server-rendered
  diagnosis → strategy → execution → simulation → verification view for
  one transaction (evidence, confidence, policy-approved candidate
  strategies, the selected one and its approval requirement, the mapped
  action, the simulation probability estimate and its factors, the
  simulated outcome/recovered amount, verification status, and full audit
  metadata per stage), with an explicit "AI GENERATED" /
  "DETERMINISTIC FALLBACK" badge per AI-capable stage and a prominent
  "SIMULATION MODE" badge over the entire recovery-execution area. The
  `/recovery` route is now a real **portfolio dashboard**: it runs the
  full `RecoveryPipeline`/`BatchRecoveryPipeline` over the bundled sample
  dataset server-side and renders pipeline status counts, priority/
  diagnosis/strategy/execution distributions, revenue at risk, and
  **simulated** recovered amount/recovery rate — all computed live, no
  fabricated chart or number, and every recovery figure explicitly
  SIMULATED. The remaining two routes (transactions, audit log) are still
  empty-state placeholders.
- Deterministic sample data: `data/samples/transactions.json` (rich) and
  `data/samples/transactions.csv` (flat), covering successful payments,
  issuer declines, insufficient funds, UPI failures, network timeouts,
  expired cards, checkout abandonment, repeated failures, and refunds. The
  generator (`scripts/generate-sample-data.ts`) now produces realistic,
  weighted, repeat-customer distributions at any scale (verified
  deterministic at 10,000 records) and emits both JSON and CSV.
- Four evaluation harnesses against synthetic, ground-truth cases —
  `data/evaluation/diagnosis-cases.json` (22 cases) /
  `pnpm evaluate:diagnosis`, `data/evaluation/strategy-cases.json`
  (25 cases) / `pnpm evaluate:strategy`,
  `data/evaluation/recovery-cases.json` (30 cases) /
  `pnpm evaluate:recovery`, and `data/evaluation/pipeline-cases.json`
  (50 cases) / `pnpm evaluate:pipeline` — the last of these runs the real,
  complete `RecoveryPipeline` end to end (no hand-constructed intermediate
  stage output) and reports pipeline-status accuracy, policy violations,
  invalid outputs, verification failures, and same-seed simulation
  consistency. All four compute real results from an actual run against
  the real agents; none hardcode a result.
- 376+ Vitest tests across 47+ files: domain types, config validation, the
  payment simulator's determinism, ingestion (valid/malformed JSON+CSV),
  every failure classification category, risk/recoverability scoring
  bounds and behavior, prioritization ordering, dataset-generator
  determinism, CLI command/service wiring, the full diagnosis/strategy/
  recovery agent suites, and — new this phase — detection (every
  detected/actionable rule), prioritization (every factor), the full
  `RecoveryPipeline` (successful/skipped/blocked/manual-review/
  verification-failure paths, stage-metadata preservation, never throwing),
  and `BatchRecoveryPipeline` (mixed outcomes, deterministic aggregation,
  metrics consistency) — no real API or network calls in any automated
  test.

**Explicitly NOT implemented (by design, at this stage):**

- **No real payment recovery of any kind.** Every recovery execution in
  this repository is a **SIMULATION** — `RecoveryExecutionResult.
  simulationMode` is always `true`; there is no code path, in the CLI, the
  dashboard, or any agent, that can mark one `false`.
- **No live Razorpay execution.** `RazorpayPaymentProvider` and
  `RazorpayRecoveryActionProvider` throw until implemented; the recovery
  simulator never contacts Razorpay, a bank, a UPI provider, or a customer.
- **No real money movement, anywhere.** Nothing in the CLI, JSON output,
  or dashboard claims a "₹X recovered" outside of an explicit `SIMULATED`
  label. Every recoverable/recovered amount shown is either a deterministic
  *projection* (`expectedRecoveryAmount`, pre-execution) or a *simulated*
  outcome (`recoveredAmount`, post-execution) — never confirmed real
  revenue.
- **No production recovery workflows.** `recover --live` is rejected
  outright with a clear error rather than silently downgraded to
  simulation or left to fail unpredictably; there is no approval-granting
  mechanism yet, so every strategy that `requiresHumanApproval` resolves
  to `pending`, never to an auto-approved execution.
- No persistent database — `@recoverai/database` only has an in-memory
  store, so `ingest`, `analyze`, `agent`, and `recover` each start fresh
  per invocation; there is no cross-process persistence yet. (`recover`
  does persist a `RecoveryAction` record and two `AuditEvent`s per run into
  that same throwaway in-memory store, via the existing
  `RecoveryActionRepository`/`AuditEventRepository` — exercising those
  abstractions for the first time — but nothing survives past the process
  exiting.)
- `init`, `simulate`, `report`, and every `agent` stage other than
  `diagnosis`/`strategy` are still stubs.

## 12. Planned implementation phases

1. ~~**Ingestion & intelligence**~~ — ✅ done: real `ingest`/`analyze`,
   deterministic classification and risk scoring (`@recoverai/analysis`).
2. ~~**AI Diagnosis Agent**~~ — ✅ done: `GroundedDiagnosisAgent` — grounded,
   evidence-cited, LLM-assisted diagnosis (Anthropic) with a deterministic
   fallback, wired into the CLI and dashboard, with an evaluation harness.
3. ~~**Strategy Selection Agent**~~ — ✅ done: `GroundedStrategyAgent` —
   policy-bounded strategy selection over a validated `Diagnosis` +
   deterministic risk context, wired into the CLI and dashboard, with its
   own evaluation harness. Recommends only; executes nothing.
4. ~~**Recovery Execution Simulator**~~ — ✅ done: `SimulatedRecoveryAgent` +
   `RecoveryExecutionPolicy` + `RecoveryExecutionSimulator` +
   `DeterministicVerificationAgent` — a policy-gated, deterministically
   seeded **simulation** of recovery execution (never live), wired into the
   CLI (`recoverai recover`) and dashboard, with its own evaluation
   harness. `--live` is rejected outright; there is no hidden live path.
5. ~~**Detection, Prioritization & Full Recovery Pipeline**~~ — ✅ done:
   deterministic `DeterministicDetectionAgent` and
   `DeterministicPrioritizationAgent` (no model, ever), a complete
   `RecoveryPipeline` that orchestrates Detection → Prioritization →
   Diagnosis → Strategy → Recovery Execution → Verification → Audit without
   ever throwing for an expected business outcome, and a sequential
   `BatchRecoveryPipeline` with deterministic portfolio metrics — wired
   into `recoverai pipeline run` and the `/recovery` dashboard, with its
   own evaluation harness (`pnpm evaluate:pipeline`).
6. **Persistence** — a real database backend (Postgres via Prisma or
   Drizzle) implementing the `Database` shape already defined in
   `@recoverai/database`, so ingested data and every agent decision
   (diagnosis, strategy, simulated execution, verification) survive across
   CLI invocations and dashboard requests, instead of each starting from a
   fresh in-memory store.
7. **Real recovery execution** — implement a live `RecoveryActionProvider`
   (e.g. real email/SMS/WhatsApp senders, a real payment-link generator)
   behind the same `RecoveryAgent` interface the simulator already
   implements, gated by an actual human-approval mechanism for every
   strategy that `requiresHumanApproval` — turning today's `pending`
   outcome into a real, audited action for the first time.
8. **Full dashboard data wiring** — connect the remaining routes
   (transactions, recovery activity, audit log) to real ingested/analyzed/
   executed data, replacing today's per-request in-memory recomputation.
9. **Real Razorpay integration** — implement `RazorpayPaymentProvider` /
   `RazorpayRecoveryActionProvider` behind the existing interfaces, with no
   changes required to the domain layer or agents — the same interface
   boundary that lets `RecoveryExecutionSimulator` stand in today.
10. **Metrics & evaluation at the real-recovery layer** — once §7–9 exist,
    measure real recovery-agent performance against ground truth, extending
    (not replacing) the simulation-based evaluation harnesses already in
    place for diagnosis, strategy, and simulated recovery.

## License

UNLICENSED — internal project, not yet published.
