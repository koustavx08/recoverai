# RecoverAI

**AI-powered revenue recovery infrastructure for merchants.**

> **Status: deterministic intelligence layer, no AI/recovery yet.** The CLI
> can genuinely ingest transaction data (JSON or CSV), classify why
> payments failed, and score revenue risk/recoverability — all with fixed,
> documented rules, not a model. Nothing in this repo executes a real
> recovery action, calls an LLM, or claims money has been recovered. See
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
recoverai recover    # select a strategy and execute a recovery action [not implemented]
recoverai report     # generate a merchant-facing recovery report      [not implemented]
recoverai agent      # run/inspect a single agent pipeline stage       [not implemented]
```

Every command follows the same layering: **CLI command → service → core
domain**. Command handlers in `packages/cli/src/commands` only parse and
validate input (via Zod) and print results — they never contain business
logic. That logic belongs in a service (`packages/cli/src/services`),
which calls into `packages/analysis` (for `ingest`/`analyze`) and will
eventually call into `packages/agents` and `packages/integrations` for
the remaining commands.

```bash
recoverai ingest --file data/samples/transactions.json
recoverai ingest --file data/samples/transactions.csv
recoverai analyze                                  # defaults to the bundled sample dataset
recoverai analyze --file data/generated/transactions.json --json
```

`ingest` and `analyze` each start from a fresh in-memory store per
invocation — see [Current project status](#current-project-status) for
why there's no cross-process persistence yet. The other five commands
still validate their arguments for real but return "Not implemented yet."
for the actual operation.

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
Detection        — is this transaction revenue at risk?
    │
    ▼
Diagnosis         — why did it fail? (FailureReason)
    │
    ▼
Prioritization    — how much is at stake, how recoverable? (RevenueRisk)
    │
    ▼
Strategy Selection — what should we try? (RecoveryStrategy)
    │
    ▼
Recovery Execution — do it (RecoveryAction → RecoveryResult)
    │
    ▼
Verification       — did it actually work?
```

Each stage is defined as a TypeScript interface in `packages/agents/src/agents`
(`DetectionAgent`, `DiagnosisAgent`, `PrioritizationAgent`, `StrategyAgent`,
`RecoveryAgent`, `VerificationAgent`). `packages/agents/src/orchestration`
contains a thin `RecoveryPipeline` that wires the six stages together —
today every method throws `AgentNotImplementedError`, since no agent
behavior has been implemented yet. No agent in this repository makes a
real decision, calls a model, or produces a real recovery outcome.

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
| `AI_API_KEY` / `AI_MODEL`                 | `NODE_ENV=production`, once agents call a real model                                 |
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
  required), and an unimplemented Razorpay stub.
- `@recoverai/agents`: interfaces for all six pipeline stages, plus a
  `RecoveryPipeline` orchestrator that throws `AgentNotImplementedError`
  for every stage. Not implemented yet, but `@recoverai/analysis`'s
  `classifyFailure`/`scoreTransaction` already match the
  `DiagnosisAgent`/`PrioritizationAgent` shapes closely enough to become
  rule-based implementations of those interfaces later without redesign.
- `@recoverai/cli`: all seven commands registered. **`ingest` and
  `analyze` are fully functional** (real ingestion, real classification,
  real risk scoring — see [§7](#7-transaction-intelligence-deterministic-not-ai)).
  `init`, `simulate`, `recover`, `report`, `agent` still return "Not
  implemented yet."
- `apps/web`: the `/dashboard` route now renders real numbers (GMV,
  revenue at risk, estimated recoverable, failure breakdown, top
  opportunities) computed server-side from the bundled sample dataset via
  `@recoverai/analysis`. The other three routes (transactions, recovery
  activity, audit log) are still empty-state placeholders.
- Deterministic sample data: `data/samples/transactions.json` (rich) and
  `data/samples/transactions.csv` (flat), covering successful payments,
  issuer declines, insufficient funds, UPI failures, network timeouts,
  expired cards, checkout abandonment, repeated failures, and refunds. The
  generator (`scripts/generate-sample-data.ts`) now produces realistic,
  weighted, repeat-customer distributions at any scale (verified
  deterministic at 10,000 records) and emits both JSON and CSV.
- 115 Vitest tests across 18 files: domain types, config validation, the
  payment simulator's determinism, ingestion (valid/malformed
  JSON+CSV), every failure classification category, risk/recoverability
  scoring bounds and behavior, prioritization ordering, dataset-generator
  determinism, and CLI command/service wiring.

**Explicitly NOT implemented (by design, at this stage):**

- No AI/LLM calls anywhere in the codebase — classification and scoring
  are fixed rules and formulas, not model inference.
- No recovery action has ever been executed, and nothing in the CLI,
  JSON output, or dashboard claims a "₹X recovered." Every recoverable
  amount is explicitly labeled an estimate.
- No real risk-scoring _agent_ — `RecoveryPipeline` (in `@recoverai/agents`)
  still throws until it's wired to real (or `@recoverai/analysis`-backed)
  agent implementations.
- No real Razorpay integration — `RazorpayPaymentProvider` and
  `RazorpayRecoveryActionProvider` throw until implemented.
- No persistent database — `@recoverai/database` only has an in-memory
  store, so `ingest` and `analyze` each start fresh per CLI invocation;
  there is no cross-process persistence yet.
- `init`, `simulate`, `recover`, `report`, and `agent` are still stubs.

## 12. Planned implementation phases

1. ~~**Ingestion & intelligence**~~ — ✅ done this phase: real `ingest`/`analyze`,
   deterministic classification and risk scoring (`@recoverai/analysis`).
2. **Persistence** — a real database backend (Postgres via Prisma or
   Drizzle) implementing the `Database` shape already defined in
   `@recoverai/database`, so ingested data survives across CLI
   invocations and dashboard requests.
3. **Agents** — implement `DetectionAgent`/`DiagnosisAgent`/
   `PrioritizationAgent` as thin wrappers around `@recoverai/analysis`'s
   rules first, before introducing any model-backed reasoning.
4. **Strategy & recovery** — implement `StrategyAgent` and `RecoveryAgent`
   against the simulator first; wire `RecoveryPipeline.run()` end to end.
5. **Verification & audit** — implement `VerificationAgent` and persist a
   real `AuditEvent` for every pipeline stage via `AuditEventRepository`.
6. **Full dashboard data wiring** — connect the remaining routes
   (transactions, recovery activity, audit log) to real ingested/analyzed
   data.
7. **Real Razorpay integration** — implement `RazorpayPaymentProvider` /
   `RazorpayRecoveryActionProvider` behind the existing interfaces, with no
   changes required to the domain layer or agents.
8. **Metrics & evaluation** — measure recovery-agent performance against
   ground truth, starting with the simulator before touching real payments.

## License

UNLICENSED — internal project, not yet published.
