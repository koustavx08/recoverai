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
- `packages/cli/src/index.ts`'s `main()` special-cases `CliValidationError`
  (a clean, always-shown message) and now also catches every other
  unexpected exception, printing one clean `Unexpected error: <message>`
  line instead of a raw Node stack trace — the full stack is still
  available via `DEBUG=1`, just opt-in rather than always dumped at the
  operator. This was a robustness gap (bad operator experience on an
  unexpected bug), not a privilege or information-disclosure issue, since
  this is a local CLI the operator runs against their own machine/files.

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
- The web dashboard (`apps/web`) now has a real authentication and
  per-merchant authorization layer (Auth.js v5, `middleware.ts`,
  `@recoverai/database`'s `UserRepository`) — every route requires a
  signed-in session, and every session is scoped to exactly one
  `merchantId`; see "Known limitations" below for what this does and
  does not cover. The CLI has no authentication layer at all — it
  assumes the person invoking it is the merchant/operator, matching the
  threat assumption above.

## Known limitations

- **Authentication and per-merchant isolation exist now, with login
  rate-limiting and a sign-in audit trail; the account model itself is
  still a demo convenience, not production-grade.** `apps/web` gates
  every route behind a login and scopes every data loader to the
  signed-in session's `merchantId` (`TransactionRepository`/
  `AuditEventRepository.findByMerchant`) — see [§11 of the
  README](../README.md#11-current-project-status). `auth.ts`'s
  `authorize()` now locks an account out for 15 minutes after 5
  consecutive failed attempts (`apps/web/lib/auth-lockout.ts`, unit
  tested in isolation) — a locked account is rejected outright, without
  even comparing the password, until the cooldown expires — and every
  sign-in success/failure is written to `AuditEventRepository` as a
  `user_signed_in`/`user_sign_in_failed` event, scoped to that user's
  merchant. What's still missing: there is no self-serve account
  creation, invite, or password-reset flow (accounts are seeded
  idempotently by `apps/web/lib/auth-seed.ts` with a shared demo password
  from `DEMO_USER_PASSWORD`); sign-out is not separately audited (only
  sign-in/sign-in-failure); and no role distinction — every user for a
  merchant has identical access to that merchant's data. None of this
  blocks the core property (one merchant's data is inaccessible to
  another's signed-in user), but a real multi-user deployment needs a
  real account-provisioning system in place of `auth-seed.ts`.
- **`Content-Security-Policy` is present but not strict on `script-src`/
  `style-src`.** `apps/web/next.config.ts` sets `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
  and now a `Content-Security-Policy` on every response —
  `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, and `frame-ancestors 'none'` are all real,
  effective restrictions. `script-src`/`style-src` include
  `'unsafe-inline'` deliberately, not by oversight: Next's App Router
  streams RSC payloads to the client via inline `<script>` tags on every
  page, and a plain `script-src 'self'` blocks them, breaking hydration
  everywhere. The strict alternative is a per-request nonce generated in
  `middleware.ts` — the same file that gates authentication — and this
  review chose not to touch that file for a CSP nonce, to avoid any risk
  of regressing the already-verified auth gate. Verified: a production
  `next build && next start`, signed in via a real HTTP flow, renders
  `/dashboard` correctly with this CSP applied (see [§11 of the
  README](../README.md#11-current-project-status)).
- **Audit events written by the CLI are persistent; the dashboard's own
  audit view is not tamper-evident.** `AuditEventRepository.append` is
  backed by the same SQLite/Prisma store as everything else
  (`packages/database/src/prisma/audit-event-repository.ts`) — every
  event the CLI (`recoverai recover`/`pipeline run`/`agent`, and now the
  dashboard's own sign-in/sign-in-failure events, see [§11 of the
  README](../README.md#11-current-project-status)) writes survives a
  restart. What's still missing: no cryptographic tamper-evidence (no
  hash-chaining between events, so a direct database edit isn't
  detectable), and no explicit retention/rotation policy. Separately,
  `/audit-log` itself still recomputes its view fresh from a pipeline
  re-run rather than reading back from this store — see the "dashboard
  doesn't record its own page views" note in the README; that's a
  deliberate choice (a GET must never create a permanent record), not an
  oversight, but it does mean the dashboard's audit view and the durable
  store can show different events for the same transaction.
- **CLI unexpected-error handling now prints one clean line by
  default.** `packages/cli/src/index.ts`'s `main()` catches any error
  that isn't a `CliValidationError` and prints `Unexpected error: <
  message>` plus a hint to re-run with `DEBUG=1` for the full stack
  trace — the raw Node stack is still available, just opt-in, rather
  than always dumped at the operator. This is a UX fix only: it doesn't
  change which errors are thrown or suppress anything.
- **The redaction patterns in `redact-secrets.ts` are heuristic, not
  exhaustive — broadened, but still not a substitute for never letting a
  provider's raw error reach storage in the first place.** Beyond
  Anthropic/OpenAI/Stripe-style `sk-`/`sk_` keys and Bearer tokens, it now
  also covers AWS access key IDs, GitHub tokens, Slack tokens, JWTs, and
  any value explicitly labeled as an `api_key`/`secret`/`token`/
  `password`/`auth` in text (`key: "..."`, `token=...`). A differently
  shaped, unlabeled credential from a future provider could still slip
  through — this is defense in depth, not a guarantee.
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
