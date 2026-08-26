/**
 * @recoverai/config
 *
 * Typed, Zod-validated environment configuration shared across the CLI,
 * web app, and services. Import `loadConfig()` at process startup — do not
 * read `process.env` directly elsewhere in the codebase.
 */
export { loadConfig } from "./load.js";
export { ConfigValidationError } from "./errors.js";
export { envSchema } from "./schema.js";
export type { AppConfig } from "./types.js";
export type { RawEnv } from "./schema.js";
