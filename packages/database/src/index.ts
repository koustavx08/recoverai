/**
 * @recoverai/database
 *
 * Persistence layer implementing the repository ports defined in
 * @recoverai/core. Ships two implementations behind the same `Database`
 * shape: an in-memory store (tests, isolated demo runs) and a SQLite
 * (via Prisma) store (`createPrismaDatabase()`) for durable, cross-process
 * persistence — see README "Planned implementation phases".
 */
export * from "./database.js";
export * from "./in-memory/index.js";
export * from "./prisma/index.js";
