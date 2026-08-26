# RecoverAI

**AI-powered revenue recovery infrastructure for merchants.**

> **Status: early foundation.** This repository currently contains
> architecture, domain types, interfaces, configuration, sample data, and
> runnable scaffolding — not a working recovery product. Every "not
> implemented yet" and TODO marker in this codebase is deliberate. See
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
                         │   apps/web (Next.js) │  merchant dashboard (UI only)
                         └──────────┬───────────┘
                                    │
                         ┌──────────┴───────────┐
                         │   packages/cli        │  developer-facing CLI
                         └──────────┬───────────┘
                                    │  command → service → core
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────┴─────────┐ ┌─────────┴─────────┐ ┌─────────┴─────────┐
   │  packages/agents     │ │ packages/database  │ │ packages/integrations│
   │  detection→diagnosis  │ │ repository ports    │ │ PaymentProvider,     │
   │  →prioritization→     │ │ + in-memory impl    │ │ RecoveryActionProvider│
   │  strategy→recovery→   │ │                     │ │ + simulator/Razorpay  │
   │  verification (stubs) │ │                     │ │                       │
   └──────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
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

## 4. Repository structure

```text
recoverai/
├── apps/
│   └── web/                # Next.js merchant dashboard (UI shell only)
│       ├── app/             # dashboard, transactions, recovery, audit-log
│       ├── components/      # layout shell + shadcn-style UI primitives
│       └── lib/
│
├── packages/
│   ├── core/                # domain models, enums, repository/system ports
│   ├── config/               # typed env config, validated with Zod
│   ├── cli/                  # `recoverai` CLI (Commander + Zod)
│   │   └── src/{commands,services,utils}
│   ├── agents/                # Detection→...→Verification agent contracts
│   │   └── src/{agents,orchestration,tools}
│   ├── integrations/           # PaymentProvider / RecoveryActionProvider
│   │   └── src/{interfaces,simulator,razorpay}
│   └── database/                # repository implementations (in-memory today)
│
├── data/
│   ├── samples/                  # hand-authored deterministic fixtures
│   └── generated/                 # output of scripts/generate-sample-data.ts (gitignored)
│
├── docs/
├── scripts/                        # generate-sample-data.ts
├── tests/                           # cross-package/integration tests
├── .env.example
└── pnpm-workspace.yaml
```

`packages/cli`, `packages/agents`, and `apps/web` all depend on `core` for
types — none of them define their own copies of `Transaction`,
`RevenueRisk`, etc.

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
recoverai init       # scaffold local project configuration
recoverai ingest     # load transaction data into the store
recoverai analyze    # run risk analysis via the agent pipeline
recoverai simulate   # exercise the pipeline via the payment simulator
recoverai recover    # select a strategy and execute a recovery action
recoverai report     # generate a merchant-facing recovery report
recoverai agent      # run/inspect a single agent pipeline stage
```

Every command follows the same layering: **CLI command → service → core
domain**. Command handlers in `packages/cli/src/commands` only parse and
validate input (via Zod) and print results — they never contain business
logic. That logic belongs in a service (`packages/cli/src/services`), which
will eventually call into `packages/agents`, `packages/database`, and
`packages/integrations`.

Today, every command validates its arguments for real but returns "Not
implemented yet." for the actual operation — see
[Current project status](#current-project-status).

## 7. Agent architecture

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

## 8. Local development setup

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
pnpm dev:cli -- analyze --all     # run the CLI from source via tsx, no build needed

# generate a larger synthetic dataset
pnpm generate:data -- --count 200
```

## 9. Environment variables

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

## 10. Current project status

**Implemented:**

- Monorepo structure, strict TypeScript config, ESLint, Prettier.
- `@recoverai/core`: domain models, enums, and repository/system ports.
- `@recoverai/config`: typed, Zod-validated environment configuration.
- `@recoverai/database`: repository interfaces + an in-memory implementation.
- `@recoverai/integrations`: `PaymentProvider` / `RecoveryActionProvider`
  abstractions, a deterministic simulator implementation (no credentials
  required), and an unimplemented Razorpay stub.
- `@recoverai/agents`: interfaces for all six pipeline stages, plus a
  `RecoveryPipeline` orchestrator that throws `AgentNotImplementedError`
  for every stage.
- `@recoverai/cli`: all seven commands (`init`, `ingest`, `analyze`,
  `simulate`, `recover`, `report`, `agent`) wired up with Zod-validated
  options and a clean command → service → core layering. Every service
  currently returns "Not implemented yet."
- `apps/web`: a Next.js dashboard shell (nav, dashboard, transactions,
  recovery activity, audit log) with no business logic and no live data —
  every view is an explicit empty state.
- Deterministic sample data (`data/samples/`) covering successful
  payments, issuer declines, insufficient funds, UPI failures, network
  timeouts, expired cards, checkout abandonment, repeated failures, and
  refunds, plus a generator script for larger synthetic datasets.
- Vitest test suites for domain types, config validation, the simulator's
  determinism, sample data integrity, and CLI command/service wiring.

**Explicitly NOT implemented (by design, at this stage):**

- No real risk-scoring or recovery logic — `RecoveryPipeline` throws until
  real agents are written.
- No real Razorpay integration — `RazorpayPaymentProvider` and
  `RazorpayRecoveryActionProvider` throw until implemented.
- No persistent database — `@recoverai/database` only has an in-memory store.
- No AI model calls anywhere in the codebase.
- No fake or illustrative "₹X recovered" numbers anywhere in the UI or CLI
  output — every placeholder is an honest empty state.

## 11. Planned implementation phases

1. **Ingestion & persistence** — real `ingest` command, a real database
   backend (Postgres via Prisma or Drizzle) implementing the `Database`
   shape already defined in `@recoverai/database`.
2. **Risk analysis** — implement `DetectionAgent`, `DiagnosisAgent`, and
   `PrioritizationAgent` against ingested transactions, initially with
   rule-based heuristics before introducing model-backed reasoning.
3. **Strategy & recovery** — implement `StrategyAgent` and `RecoveryAgent`
   against the simulator first; wire `RecoveryPipeline.run()` end to end.
4. **Verification & audit** — implement `VerificationAgent` and persist a
   real `AuditEvent` for every pipeline stage via `AuditEventRepository`.
5. **Dashboard data wiring** — connect `apps/web` to real ingested/analyzed
   data, replacing the current empty states.
6. **Real Razorpay integration** — implement `RazorpayPaymentProvider` /
   `RazorpayRecoveryActionProvider` behind the existing interfaces, with no
   changes required to the domain layer or agents.
7. **Metrics & evaluation** — measure recovery-agent performance against
   ground truth, starting with the simulator before touching real payments.

## License

UNLICENSED — internal project, not yet published.
