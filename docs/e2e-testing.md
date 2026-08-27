# End-to-end testing

RecoverAI's end-to-end coverage lives in two files, deliberately kept
separate from the per-package unit test suites (`packages/*/src/**/*.test.ts`)
because they test a different thing: not "does this function return the
right value," but "does the real, fully-wired system do the right thing
for this scenario."

## `packages/agents/src/orchestration/pipeline.e2e.test.ts`

Runs the real `RecoveryPipeline`/`BatchRecoveryPipeline` — all six real
agent implementations (deterministic fallback mode, since no AI
credentials are set in the test environment), never a hand-rolled
substitute — through the seven scenarios that define RecoverAI's core
behavior:

1. Successful simulated recovery (every stage runs, ends `completed`)
2. An already-succeeded transaction is skipped at Detection
3. A non-retryable failure is blocked at Detection
4. An ambiguous failure escalates to `manual_review`, blocked by the
   Recovery Execution Policy
5. A strategy requiring human approval resolves to `pending`, never an
   automatic success
6. A transaction that already reached the retry cap is blocked at
   Detection (distinct from #3 — this one is retryable, it's just out of
   attempts)
7. A malformed/invalid execution result is caught by independent
   verification and fails the pipeline

Plus one batch-level test running all seven shapes together through
`BatchRecoveryPipeline` and checking the aggregated counts add up.

This file is part of the normal `pnpm test` run (it's just another
`*.test.ts` file under `packages/**/src`) — no special setup needed.

## `tests/e2e-cli.test.ts`

Spawns the actual built `recoverai` CLI binary
(`packages/cli/dist/index.js`) as a real child process — real argv, real
stdout/stderr, real exit code — rather than calling an exported service
function in-process. This is the one thing the service-layer tests
(`packages/cli/src/services/*.test.ts`, which call `runPipeline`/
`runRecover` directly) cannot cover: whether the CLI *as a user actually
invokes it* behaves correctly, including Commander's own argument
parsing and the exit-code contract (`process.exitCode = 1` on error).

Covers:

- `recoverai pipeline run --transaction <id> --file data/demo/scenarios.json --json`
  — exits 0, produces valid JSON, status `completed`
- `recoverai pipeline run --file data/demo/scenarios.json --json` — exits
  0, batch counts match the known demo dataset shape (6 total, 1
  completed, 3 blocked, 2 skipped, 0 failed)
- `recoverai pipeline --help` — exits 0, documents simulation-only
  behavior
- `recoverai recover --transaction <id> --json` — exits 0, `simulated:
  true`
- `recoverai recover --transaction <id> --live` — **nonzero exit**,
  rejected before any work runs, no report printed to stdout

**This requires `packages/cli/dist/index.js` to exist first.** Every
test in this file is wrapped in `describe.skipIf(!CLI_BUILT)`, so a bare
`pnpm test` on a fresh clone that hasn't been built yet **skips these
tests rather than failing** — CI always runs `pnpm build` before `pnpm
test` (see `.github/workflows/ci.yml`), so they execute for real there
automatically.

To run them deliberately (and get the actual assertions, not a skip):

```bash
pnpm test:e2e
```

which builds the whole monorepo first, then runs just this file plus the
pipeline E2E suite above.

## What's intentionally *not* here

- **No CLI test for `--live` on `pipeline run`** — that command has no
  `--live` flag to reject in the first place (see
  `docs/security-model.md`, "CLI safety").
- **No component-rendering E2E for the dashboard.** `apps/web` has no
  jsdom/`@testing-library/react` setup, and adding one wasn't judged
  worth the new dependency for this phase — see the "Dashboard/demo data
  flow" coverage instead: `apps/web/lib/{demo,transactions,audit}.test.ts`
  assert the real data a page would render (exact scenario outcomes,
  filter correctness, audit event shape) against a real pipeline/
  ingestion run, without needing to actually mount React components. If
  visual/interaction regressions become a real risk later, that's the
  natural point to add Playwright or `@testing-library/react` — not
  before there's a concrete need for it.
