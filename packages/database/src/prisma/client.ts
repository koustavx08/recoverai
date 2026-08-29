import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Default SQLite file, resolved relative to this package's root (not the
 * caller's cwd) so the CLI, the web app, and tests all connect to the same
 * physical file regardless of where the process was launched from.
 */
function defaultDatabaseUrl(): string {
  const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const dbPath = path.join(packageRoot, "prisma", "dev.db");
  return `file:${dbPath.replace(/\\/g, "/")}`;
}

let client: PrismaClient | undefined;

/**
 * Shared `PrismaClient` singleton. A real connection pool is expensive to
 * open, so every `createPrismaDatabase()` call within a process reuses the
 * same client rather than opening a fresh one — this is what lets separate
 * repository instances (and separate `createPrismaDatabase()` callers) see
 * each other's writes within one process, and is safe because SQLite
 * itself serializes writes at the file level.
 */
export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL || defaultDatabaseUrl(),
    });
  }
  return client;
}

/** Closes the shared client's connection. Intended for test teardown. */
export async function disconnectPrismaClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
