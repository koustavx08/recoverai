/**
 * @recoverai/database
 *
 * Persistence layer implementing the repository ports defined in
 * @recoverai/core. Currently ships only an in-memory implementation;
 * a real database (Postgres, etc.) is planned — see README "Planned
 * implementation phases".
 */
export * from "./database.js";
export * from "./in-memory/index.js";
