import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "@recoverai/core";
import { initOptionsSchema, runInit } from "./init-service.js";

const noopLogger: Logger = { log: () => {} };

const ENV_EXAMPLE = "DATABASE_URL=\nAI_API_KEY=\n";

describe("initOptionsSchema", () => {
  it("defaults force to false", () => {
    expect(initOptionsSchema.parse({})).toEqual({ force: false });
  });
});

describe("runInit", () => {
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await mkdtemp(join(tmpdir(), "recoverai-init-"));
    await writeFile(join(projectDir, ".env.example"), ENV_EXAMPLE, "utf-8");
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(projectDir, { recursive: true, force: true });
  });

  it("creates .env from .env.example when none exists", async () => {
    const result = await runInit({ force: false }, noopLogger);
    expect(result.status).toBe("ok");
    const written = await readFile(join(projectDir, ".env"), "utf-8");
    expect(written).toBe(ENV_EXAMPLE);
  });

  it("leaves an existing .env untouched without --force", async () => {
    await writeFile(join(projectDir, ".env"), "DATABASE_URL=custom\n", "utf-8");
    const result = await runInit({ force: false }, noopLogger);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.message).toContain("left untouched");
    const written = await readFile(join(projectDir, ".env"), "utf-8");
    expect(written).toBe("DATABASE_URL=custom\n");
  });

  it("overwrites an existing .env with --force", async () => {
    await writeFile(join(projectDir, ".env"), "DATABASE_URL=custom\n", "utf-8");
    const result = await runInit({ force: true }, noopLogger);
    expect(result.status).toBe("ok");
    const written = await readFile(join(projectDir, ".env"), "utf-8");
    expect(written).toBe(ENV_EXAMPLE);
  });

  it("errors when .env.example is missing", async () => {
    await rm(join(projectDir, ".env.example"));
    const result = await runInit({ force: false }, noopLogger);
    expect(result.status).toBe("error");
  });

  it("errors on a malformed .env.example line", async () => {
    await writeFile(join(projectDir, ".env.example"), "NOT_A_VALID_LINE\n", "utf-8");
    const result = await runInit({ force: false }, noopLogger);
    expect(result.status).toBe("error");
  });
});
