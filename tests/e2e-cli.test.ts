/**
 * True end-to-end CLI coverage: spawns the actual built `recoverai` binary
 * as a real child process (argv -> stdout/stderr/exit code), not the
 * exported service function in-process. `packages/cli/src/services/
 * *.test.ts` already covers the business-logic layer thoroughly by
 * calling `runPipeline`/`runRecover` directly — this file closes the one
 * gap that leaves: does the actual CLI, invoked the way a user invokes
 * it, behave correctly end to end?
 *
 * Requires `packages/cli/dist/index.js` to exist (`pnpm build`, or
 * `pnpm --filter @recoverai/cli build`). CI always builds before testing
 * (see .github/workflows/ci.yml), so this runs for real there. Locally,
 * tests here skip gracefully — not fail — if the CLI hasn't been built
 * yet. See docs/e2e-testing.md for how to run this deliberately.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const CLI_ENTRY = resolve(REPO_ROOT, "packages/cli/dist/index.js");
const CLI_BUILT = existsSync(CLI_ENTRY);

function runCli(args: readonly string[]) {
  const result = spawnSync("node", [CLI_ENTRY, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe.skipIf(!CLI_BUILT)("E2E: recoverai pipeline run (real spawned process)", () => {
  it("runs the full pipeline for one demo transaction and exits 0", () => {
    const { status, stdout } = runCli([
      "pipeline",
      "run",
      "--transaction",
      "demo_txn_01",
      "--file",
      "data/demo/scenarios.json",
      "--json",
    ]);

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { result: { status: string; execution?: { result: { simulationMode: boolean } } } };
    expect(parsed.result.status).toBe("completed");
    expect(parsed.result.execution?.result.simulationMode).toBe(true);
  });

  it("runs the full demo batch and exits 0 with the expected portfolio counts", () => {
    const { status, stdout } = runCli([
      "pipeline",
      "run",
      "--file",
      "data/demo/scenarios.json",
      "--json",
    ]);

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as {
      batch: { total: number; completed: number; blocked: number; skipped: number; failed: number };
    };
    expect(parsed.batch.total).toBe(6);
    expect(parsed.batch.completed).toBe(1);
    expect(parsed.batch.blocked).toBe(3);
    expect(parsed.batch.skipped).toBe(2);
    expect(parsed.batch.failed).toBe(0);
  });

  it("--help exits 0 and documents simulation-only behavior", () => {
    const { status, stdout } = runCli(["pipeline", "--help"]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain("simulation");
  });
});

describe.skipIf(!CLI_BUILT)("E2E: recoverai recover (real spawned process)", () => {
  it("runs a full simulated recovery for a real transaction and exits 0", () => {
    const { status, stdout } = runCli([
      "recover",
      "--transaction",
      "txn_00002",
      "--json",
    ]);

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { simulated: boolean; execution: { simulationMode: boolean } };
    expect(parsed.simulated).toBe(true);
    expect(parsed.execution.simulationMode).toBe(true);
  });

  it("rejects --live outright: nonzero exit, no execution attempted", () => {
    const { status, stderr, stdout } = runCli([
      "recover",
      "--transaction",
      "txn_00002",
      "--live",
    ]);

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/live recovery execution is not implemented/i);
    // Never printed a recovery report — confirms it stopped before doing any work.
    expect(stdout).toBe("");
  });
});
