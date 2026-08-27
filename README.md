# RecoverAI

**AI-powered revenue recovery infrastructure for merchants.**

> **Status: deterministic intelligence + grounded AI diagnosis and strategy
> selection. No recovery execution, no real money recovered.** The CLI
> genuinely ingests transaction data (JSON or CSV), classifies why payments
> failed, and scores revenue risk/recoverability with fixed, documented
> rules. On top of that, a real Diagnosis Agent and a real Strategy Agent
> (both LLM-assisted via Anthropic when `AI_API_KEY`/`AI_MODEL` are set,
> with a deterministic fallback otherwise) produce structured, evidence-
> grounded, policy-bounded output — see [§8](#8-agent-architecture). Neither
> agent executes anything: no payment, no payment link, no notification, no
> retry has ever run, and nothing in this repo claims money has been
> recovered. See [Current project status](#current-project-status) before
> assuming any feature works end to end.

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
recoverai agent      # run/inspect a single agent pipeline stage       [diagnosis, strategy implemented]
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

recoverai agent --stage diagnosis --transaction txn_00002
recoverai agent --stage strategy  --transaction txn_00002 --json
```

`ingest`, `analyze`, and `agent` each start from a fresh in-memory store per
invocation — see [Current project status](#current-project-status) for why
there's no cross-process persistence yet. `init`, `simulate`, `recover`,
`report`, and every `agent` stage other than `diagnosis`/`strategy` still
validate their arguments for real but return "Not implemented yet." for the
actual operation.

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
Detection        — is this transaction revenue at risk?           [not implemented]
    │
    ▼
Diagnosis         — why did it fail, and is it recoverable?        [implemented — GroundedDiagnosisAgent]
    │
    ▼
Prioritization    — how much is at stake, how recoverable?         [deterministic only — @recoverai/analysis]
    │
    ▼
Strategy Selection — what should we try?                            [implemented — GroundedStrategyAgent]
    │
    ▼
Recovery Execution — do it (RecoveryAction → RecoveryResult)         [not implemented]
    │
    ▼
Verification       — did it actually work?                           [not implemented]
```

Each stage is defined as a TypeScript interface in `packages/agents/src/agents`
(`DetectionAgent`, `DiagnosisAgent`, `PrioritizationAgent`, `StrategyAgent`,
`RecoveryAgent`, `VerificationAgent`). `packages/agents/src/orchestration`
contains a thin `RecoveryPipeline` that wires the six stages together — its
own methods still throw `AgentNotImplementedError` (wiring the pipeline
end-to-end is a later phase), but the **Diagnosis** and **Strategy
Selection** agents themselves are real, independently callable
implementations (via the CLI's `agent --stage diagnosis|strategy` and the
`/dashboard/diagnosis/[transactionId]` page), not stubs.

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

**Neither agent executes anything.** `GroundedDiagnosisAgent.diagnose()`
and `GroundedStrategyAgent.selectStrategy()` only return structured data —
no payment is charged, no payment link is sent, no notification goes out,
no retry is scheduled. That's `RecoveryAgent`'s job, and it isn't
implemented yet.

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
- `@recoverai/agents`: interfaces for all six pipeline stages, plus a
  `RecoveryPipeline` orchestrator whose own methods still throw
  `AgentNotImplementedError` (full end-to-end wiring is a later phase).
  Two stages have **real, independent implementations**:
  - **`GroundedDiagnosisAgent`** (`packages/agents/src/diagnosis/`) —
    grounded, evidence-cited, LLM-assisted diagnosis with a deterministic
    fallback. See [§8](#8-agent-architecture).
  - **`GroundedStrategyAgent`** (`packages/agents/src/strategy/`) — takes a
    `Diagnosis` + deterministic risk context, narrows the strategy
    candidate set through an explicit `StrategyPolicy` *before* any model
    ever sees it, and returns a bounded `StrategyDecision` — never an
    executed action. `requiresHumanApproval` is always computed
    deterministically, never trusted from the model.
- `@recoverai/config`: adds `AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL`;
  `config.ai.isConfigured` is true only once both a key and model are set,
  so agents can tell "no AI configured" apart from "AI configured but
  failed" without ever hardcoding credentials.
- `@recoverai/cli`: all seven commands registered. **`ingest`, `analyze`,
  and `agent --stage diagnosis|strategy` are fully functional** (real
  ingestion, real classification, real risk scoring, real grounded
  diagnosis/strategy selection — see
  [§7](#7-transaction-intelligence-deterministic-not-ai) and
  [§8](#8-agent-architecture)). `init`, `simulate`, `recover`, `report`,
  and every other `agent` stage still return "Not implemented yet."
- `apps/web`: the `/dashboard` route renders real numbers (GMV, revenue at
  risk, estimated recoverable, failure breakdown, top opportunities)
  computed server-side via `@recoverai/analysis`, linking through to
  `/dashboard/diagnosis/[transactionId]` — a real, server-rendered
  diagnosis + strategy view for one transaction (evidence, confidence,
  policy-approved candidate strategies, the selected one, its approval
  requirement, and full audit metadata for both agents), with an explicit
  "AI GENERATED" vs "DETERMINISTIC FALLBACK" badge per stage. The other
  three routes (transactions, recovery activity, audit log) are still
  empty-state placeholders.
- Deterministic sample data: `data/samples/transactions.json` (rich) and
  `data/samples/transactions.csv` (flat), covering successful payments,
  issuer declines, insufficient funds, UPI failures, network timeouts,
  expired cards, checkout abandonment, repeated failures, and refunds. The
  generator (`scripts/generate-sample-data.ts`) now produces realistic,
  weighted, repeat-customer distributions at any scale (verified
  deterministic at 10,000 records) and emits both JSON and CSV.
- Two evaluation harnesses against synthetic, ground-truth cases —
  `data/evaluation/diagnosis-cases.json` (22 cases) /
  `pnpm evaluate:diagnosis` and `data/evaluation/strategy-cases.json`
  (25 cases) / `pnpm evaluate:strategy` — both compute real accuracy from
  an actual run against the real agents; neither hardcodes a result.
- 253+ Vitest tests across 31+ files: domain types, config validation, the
  payment simulator's determinism, ingestion (valid/malformed JSON+CSV),
  every failure classification category, risk/recoverability scoring
  bounds and behavior, prioritization ordering, dataset-generator
  determinism, CLI command/service wiring, and — new this phase — the full
  diagnosis and strategy agent suites (deterministic fact/policy
  derivation for every category, Zod schema boundary tests, evidence-
  grounding and policy validation, deterministic-fallback determinism, and
  agent behavior against a mocked `AIModelProvider` — no real API calls in
  any automated test).

**Explicitly NOT implemented (by design, at this stage):**

- No real recovery action has ever been executed — no payment charged, no
  payment link sent, no notification dispatched, no retry scheduled — and
  nothing in the CLI, JSON output, or dashboard claims a "₹X recovered."
  Every recoverable amount is explicitly labeled an estimate/projection.
- No production Razorpay recovery flow — `RazorpayPaymentProvider` and
  `RazorpayRecoveryActionProvider` throw until implemented.
- No verification of actual recovered revenue — `VerificationAgent` isn't
  implemented, and there is no code path anywhere that marks a transaction
  as "recovered."
- `RecoveryPipeline.run()` (the full six-stage orchestration) still throws
  — `RecoveryAgent` and `VerificationAgent` aren't implemented, and
  `DetectionAgent`/`PrioritizationAgent` aren't wrapped as real agent
  implementations yet (their logic exists and is used directly, via
  `@recoverai/analysis`, by the CLI/web integration points instead).
- No persistent database — `@recoverai/database` only has an in-memory
  store, so `ingest`, `analyze`, and `agent` each start fresh per
  invocation; there is no cross-process persistence yet.
- `init`, `simulate`, `recover`, `report`, and every `agent` stage other
  than `diagnosis`/`strategy` are still stubs.

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
4. **Persistence** — a real database backend (Postgres via Prisma or
   Drizzle) implementing the `Database` shape already defined in
   `@recoverai/database`, so ingested data and agent decisions survive
   across CLI invocations and dashboard requests.
5. **Recovery execution** — implement `RecoveryAgent` against the
   simulator first (never real payment credentials by default), turning a
   policy-approved, human-reviewed `StrategyDecision` into a bounded
   `RecoveryAction`; wire `RecoveryPipeline.run()` end to end.
6. **Verification & audit** — implement `VerificationAgent` to
   independently confirm whether a recovery action actually recovered
   revenue (never trusting the recovery agent's own report), and persist a
   real `AuditEvent` for every pipeline stage via `AuditEventRepository`.
7. **Full dashboard data wiring** — connect the remaining routes
   (transactions, recovery activity, audit log) to real ingested/analyzed
   data, including real recovery-execution results once §5–6 exist.
8. **Real Razorpay integration** — implement `RazorpayPaymentProvider` /
   `RazorpayRecoveryActionProvider` behind the existing interfaces, with no
   changes required to the domain layer or agents.
9. **Metrics & evaluation at the recovery layer** — measure recovery-agent
   performance against ground truth, starting with the simulator before
   touching real payments (mirroring the diagnosis/strategy evaluation
   harnesses already in place).

## License

UNLICENSED — internal project, not yet published.
