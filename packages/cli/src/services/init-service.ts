import { access, copyFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Logger } from "@recoverai/core";
import { errorResult, type CommandResult } from "./types.js";

export const initOptionsSchema = z.object({
  force: z.boolean().optional().default(false),
});
export type InitOptions = z.infer<typeof initOptionsSchema>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scaffolds local RecoverAI project configuration: copies `.env.example`
 * to `.env` (refusing to overwrite an existing one unless `--force` is
 * given, since a real `.env` may already hold merchant credentials) and
 * reports whether the SQLite database still needs to be bootstrapped via
 * `pnpm db:generate`/`pnpm db:migrate`. Resolved relative to the current
 * working directory, matching every other command (`ingest --file ...`
 * behaves the same way).
 */
export async function runInit(options: InitOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "init service invoked", { force: options.force });

  const cwd = process.cwd();
  const envPath = resolve(cwd, ".env");
  const envExamplePath = resolve(cwd, ".env.example");
  const dbPath = resolve(cwd, "packages/database/prisma/dev.db");

  const envExampleExists = await exists(envExamplePath);
  if (!envExampleExists) {
    return errorResult(
      "init",
      `Could not find ".env.example" in "${cwd}". Run this command from the repository root.`,
    );
  }

  const envExists = await exists(envPath);
  const messages: string[] = [];

  if (envExists && !options.force) {
    messages.push(".env already exists — left untouched (pass --force to overwrite it).");
  } else {
    await copyFile(envExamplePath, envPath);
    messages.push(envExists ? ".env overwritten from .env.example." : ".env created from .env.example.");
  }

  const dbExists = await exists(dbPath);
  if (!dbExists) {
    messages.push(
      "No local database found yet — run `pnpm db:generate && pnpm db:migrate` before `ingest`/`analyze`/`recover`.",
    );
  } else {
    messages.push("Local SQLite database already present — ready for `ingest`/`analyze`/`recover`.");
  }

  // Sanity check that .env at least parses as line-based KEY=VALUE — a
  // genuinely malformed file is worth surfacing now rather than at the
  // first config load deep inside a later command.
  const envContents = await readFile(envPath, "utf-8");
  const malformedLine = envContents
    .split("\n")
    .find((line) => line.trim().length > 0 && !line.trim().startsWith("#") && !line.includes("="));
  if (malformedLine) {
    return errorResult("init", `".env" has a malformed line (expected KEY=VALUE): "${malformedLine}"`);
  }

  return { status: "ok", command: "init", message: messages.join(" ") };
}
