# Security and architecture review

This document is the result of an adversarial code review of RecoverAI's
safety boundaries — not a compliance claim. It describes what was
checked, what was found, what was fixed, and what remains a known
limitation. Every claim below was verified by reading the actual
implementation (and, where noted, by running or adding a test) — this is
not a restatement of design intent from the other docs.

**This is not a certification.** RecoverAI is a hackathon-stage,
simulation-only project. Nothing here should be read as "audited,"
"penetration-tested," or "production-hardened."

## Trust boundaries

```text
Untrusted / external           Trusted / internal
─────────────────────          ──────────────────────────────
Anthropic API response    -->  AIModelProvider.generateStructured()
                                  -> Zod schema (bounded enums only)
                                  -> validateLlmDiagnosisResponse /
                                     validateLlmStrategyResponse
                                     (evidence grounding + policy check)
                                  -> discarded entirely on any failure,
                                     replaced by a deterministic result

CLI flags / JSON-RPC-ish      -->  Zod option schemas per command
  CLI options                      (pipelineRunOptionsSchema, etc.)

Web route params (searchParams,-->  Whitelist checks against bounded
  dynamic [transactionId])         enums (isTransactionStatus) or plain
                                    string-equality lookups — never
                                    interpolated into a query, path, or
                                    eval'd

Ingested transaction JSON/CSV -->  parseJsonRecords/parseCsvRecords
  (a merchant's own file)          (structural checks only) -> Zod
                                    record schema -> NormalizedTransaction
```

The only genuinely external, adversarial-in-principle input in this
codebase is the AI provider's response. Everything else (CLI flags,
web route params, ingested files) is supplied by the same person
operating the tool — the review still checks it (malformed input should
fail cleanly, not corrupt state), but it is not a privilege-escalation
boundary the way the AI response is.

## AI boundaries

Verified in `packages/agents/src/diagnosis/validation.ts` and
`strategy/validation.ts`:

- **Evidence grounding**: an LLM response citing an evidence id that
  doesn't exist in the bundle it was given is rejected outright — the
  agent falls back deterministically rather than trusting a partially-
  grounded response.
- **Transaction identity**: a response whose `transactionId` doesn't
  match the request is rejected (`grounded-diagnosis-agent.ts`,
  `grounded-strategy-agent.ts`).
- **Bounded categories/strategies**: `DiagnosisCategory` and
  `RecoveryStrategyType` are closed Zod enums — the SDK call itself
  (`AnthropicProvider.generateStructured`) forces the model to answer
  through exactly one tool call matching that schema
  (`tool_choice: { type: "tool" }`); a response that doesn't parse
  throws before it ever reaches the agent's own validation.
- **Policy-approved strategy, not just enum-valid**: `strategy/
  validation.ts` additionally checks the chosen strategy against
  `allowedStrategies` — the *narrowed, per-transaction* candidate set
  `buildStrategyPolicyContext` computed *before* the model was ever
  called. A syntactically valid strategy the policy already excluded
  (e.g. `auto_retry`-mapped strategies once retryable is false or the
  attempt cap is reached) is rejected exactly like an unknown one.
- **`requiresHumanApproval` is never taken from the model.** Both
  `deterministic-strategy.ts` and `grounded-strategy-agent.ts` compute it
  via `requiresHumanApproval(chosenStrategy)` — a fixed lookup table
  (`STRATEGY_REQUIRES_HUMAN_APPROVAL`) keyed by the enum, independent of
  anything the LLM said.
- **On any failure — a provider error, a non-parsing response, a failed
  validation check — the agent falls back to a fully deterministic
  result and marks `metadata.mode: "deterministic"`, `fallbackUsed:
  true`.** It never partially trusts or repairs a bad LLM response.
- **Confirmed by test**: `grounded-diagnosis-agent.test.ts` and
  `grounded-strategy-agent.test.ts` both exercise the rejection paths
  (unknown evidence id, mismatched transaction id, policy-excluded
  strategy) and assert the fallback fires.

## Execution boundaries

Verified in `packages/agents/src/recovery/policy.ts`,
`action-mapping.ts`, `simulated-recovery-agent.ts`:

- **`RecoveryExecutionPolicy.canExecute()` is the only place execution is
  gated**, and `mapStrategyToAction` is the only place a strategy becomes
  an action. Both were confirmed to be called from exactly one call site
  each (`SimulatedRecoveryAgent.executeRecovery` and `canExecute`
  respectively) — nothing else in `packages/agents`, `packages/cli`, or
  `apps/web` constructs a `RecoveryExecutionResult` or calls
  `mapStrategyToAction` directly.
- **The strategy→action map is `Record<RecoveryStrategyType,
  RecoveryActionType>`** — TypeScript forces every strategy the core enum
  ever grows to get an explicit action, so there is no code path where an
  unmapped strategy silently reaches execution with an undefined or
  guessed action.
- **`manual_review` is always blocked** (`canExecute` returns
  `allowed: false` immediately) — it is a decision to defer to a human,
  never something the simulator can execute a plan for.
- **Retry limits are enforced independently at three layers**, not one:
  `DeterministicDetectionAgent` (`DETECTION_RETRY_CAP = 3`, blocks
  actionability outright), `buildStrategyPolicyContext`
  (`STRATEGY_MAX_RETRY_ATTEMPTS = 3`, excludes retry-based candidates
  before the model sees them), and `canExecute`
  (`RECOVERY_MAX_RETRY_ATTEMPTS = 3`, blocks a retry-based action at
  execution time regardless of what Strategy chose). All three read the
  same cap and the same attempt count; none defers to another layer
  having already checked it. A caller would have to defeat all three
  independently to get an over-the-limit retry executed.
- **Non-retryable failures cannot be retried**, checked at the same three
  layers (Detection's `retryable` flag, Strategy policy's exclusion of
  `RETRY_BASED_STRATEGIES` when `!input.retryable`, and `canExecute`'s
  own `diagnosis.category === "non_retryable" || !retryRecommendation.
  recommended` check).
- **A strategy that `requiresHumanApproval` can only ever resolve to
  `pending`.** There is no code path anywhere in this repository that
  reads a `pending` `RecoveryExecutionResult` back in and re-simulates or
  "approves" it to `success` — no automated approval mechanism exists,
  by design. Turning `pending` into a real outcome is future work
  (README §12), not a currently-reachable state transition.

## Simulation guarantees

- **`RecoveryExecutionRequest.executionContext.simulationMode` is
  hardcoded to `true` inside `RecoveryPipeline.toRecoveryExecutionRequest`
  — it is not read from `PipelineTransactionFacts` at all** (that type has
  no `simulationMode`/`live` field). This means there is no input a
  caller (CLI, web, or a hand-built facts object in a test) could set to
  make the *pipeline* build a live request; the only place `--live`
  exists as a concept is `recoverai recover`'s own flag, which is
  rejected before any pipeline work starts (`recover-service.ts`:
  `if (options.live) return errorResult(...)`, before ingestion even
  runs). `recoverai pipeline run` does not expose a `--live` flag at all.
- **`canExecute()` independently re-checks `simulationMode` too**: if it
  were ever `false` for any reason, execution is blocked with an explicit
  "Live execution is not implemented" reason, before the strategy/
  manual_review/retry checks even run.
- **The execution-result schema pins `simulationMode: z.literal(true)`**
  — a schema violation, not a runtime check, if anything ever tried to
  produce `false`.
- **Verification independently re-checks `simulationMode === true`** on
  every result (`deterministic-verification.ts`), and independently
  checks that `recoveredAmount` is exactly zero for every non-`success`
  outcome and strictly greater than zero only for `success` — so a
  tampered or malformed result claiming money moved without a real
  simulated success is caught, not trusted.
- **`RecoveryExecutionSimulator.simulate()` takes only `{seed,
  probabilityOfSuccess, amount}`** — a pure, deterministic computation
  over `seededFloat(seed)`. It has no HTTP client, no Razorpay SDK
  import, no network access of any kind; there is no code path from an
  LLM's output to an actual API call anywhere in this repository.

## Verification independence

`verifyRecoveryExecution()` (`deterministic-verification.ts`) takes only
the `RecoveryExecutionResult` itself — no reference to whatever code
produced it — and checks every "impossible state" explicitly:
`executionId`/`transactionId` present, `simulationMode === true`,
`recoveredAmount` consistent with `outcome` (zero unless `success`, and
strictly positive when `success`), and `blockedReason` present if and
only if `outcome === "blocked"`. This is exercised by 11 existing unit
tests, including adversarial ones (a "success" with zero amount, a
"blocked" with no reason, a `blockedReason` set on a non-blocked
outcome) — reviewed and found already correct; no gap identified here.

## Audit integrity and secret handling

- **The Anthropic API key is passed only to the SDK constructor**
  (`AnthropicProvider`) and never logged, stored in an `AuditEvent`, or
  included in any response object this codebase constructs.
- **Finding (fixed this review): AI provider error messages were stored
  verbatim.** When `GroundedDiagnosisAgent`/`GroundedStrategyAgent` catch
  a provider error, the raw `Error.message` became the audit-persisted
  `fallbackReason` (and was rendered on the diagnosis dashboard page) —
  a string that originates from a third-party SDK, not this codebase,
  which offers no contractual guarantee it never echoes request details.
  Fixed by adding `packages/agents/src/security/redact-secrets.ts` and
  applying it in both agents' catch blocks before the message is logged
  or stored. It targets credential-shaped substrings specifically
  (`sk-ant-…`, generic `sk-…` keys, `Bearer …` tokens) — deliberately
  **not** a broad "redact anything long" pattern, since that would also
  strip legitimate transaction ids/UUIDs from the very reason a human is
  reading it to debug. Covered by 5 new unit tests
  (`redact-secrets.test.ts`), including two confirming legitimate ids are
  left alone.
- **Audit event data fields are always flat primitives**
  (`Metadata = Record<string, string | number | boolean | null>`) — there
  is no code path that stores a nested object, a raw error object, or an
  arbitrary blob into an `AuditEvent.data` field.

## CLI safety

- `recoverai recover --live` is rejected with a clear error *before* any
  ingestion or agent work runs — not silently downgraded to simulation,
  not queued, not partially executed.
- `recoverai pipeline run` has no `--live` flag at all — there was never
  a flag to reject in the first place for that command.
- Every command's options are parsed through a Zod schema
  (`pipelineRunOptionsSchema`, `RecoverOptions`, etc.) before use — a
  malformed flag value fails validation rather than reaching business
  logic with an unexpected shape.
- **Known limitation, not a security bug**: `packages/cli/src/index.ts`'s
  `main()` only special-cases `CliValidationError`; any other unexpected
  exception is re-thrown and surfaces as a raw Node stack trace rather
  than a clean error message. Since this is a local CLI the operator runs
  against their own machine/files, this is a robustness gap (bad
  operator experience on an unexpected bug), not a privilege or
  information-disclosure issue — noted here rather than fixed, to avoid
  broadening this review's scope beyond what it verified.

## API input validation (web)

- `/transactions?status=` is checked against a fixed whitelist
  (`isTransactionStatus`) before being used to filter — an arbitrary
  string in the query param is simply ignored (falls back to "all"), never
  interpolated into anything.
- `/dashboard/diagnosis/[transactionId]` looks the id up via plain
  string equality against the ingested dataset (`transactions.find(t =>
  t.id === transactionId)`) — no path traversal, no query construction,
  and a miss renders the styled `not-found.tsx` rather than throwing.
- `JSON.parse` is used directly (no `eval`, no unsafe deserializer) in
  `parseJsonRecords` — a parse failure throws a clean, caught error;
  `JSON.parse` does not have a prototype-pollution risk on its own the
  way an object-merge utility would.

## Threat assumptions

This review assumes:

- The person running the CLI and the person viewing the dashboard are the
  merchant/operator themselves — not an untrusted third party. File paths
  passed to `--file` and JSON/CSV content ingested are trusted inputs
  from that operator, not attacker-controlled network input.
- The only input this system treats as genuinely adversarial is the AI
  provider's response — because a model's output is inherently
  unpredictable even when the provider itself is trusted infrastructure.
- There is no authentication/authorization layer anywhere in this
  codebase (no login, no per-merchant access control on the dashboard).
  That is explicitly out of scope for this phase — see "Known
  limitations" below — and this review does not claim otherwise.

## Known limitations

- **No authentication or multi-tenant isolation.** The web dashboard has
  no login and no access control; anyone who can reach it can see every
  ingested transaction and every diagnosis. Fine for a local hackathon
  demo, not fine for anything resembling production.
- **No persistent audit store.** Every `AuditEvent` shown anywhere
  (CLI, `/audit-log`) is computed fresh per process/request from an
  in-memory store — there is no tamper-evidence, no retention, and
  nothing survives a restart. An audit trail that can't outlive the
  process it ran in is not yet a real compliance-grade audit trail.
- **CLI unexpected-error handling is not clean** (see "CLI safety"
  above) — a bug surfaces as a raw stack trace, not a graceful message.
- **The redaction patterns in `redact-secrets.ts` are heuristic, not
  exhaustive.** They cover Anthropic/OpenAI-style key shapes and Bearer
  tokens specifically; a differently-shaped credential in a future
  provider's error message would not be caught by today's patterns.
- **This review is code-level, not operational.** It did not check
  deployment configuration, dependency supply-chain provenance (beyond
  what's described above), or infrastructure — because none of that
  exists yet for this project.

## What this review is not

It is not a claim that RecoverAI has undergone third-party penetration
testing, a formal audit, or any compliance certification. It is a
documented, code-verified pass over the specific safety boundaries this
project depends on — detection/prioritization gating, AI-output
validation, execution policy, simulation-only guarantees, and
verification independence — performed and recorded so the reasoning
behind them is auditable by anyone reading this file, not just implied
by the code.
