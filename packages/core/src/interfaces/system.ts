/**
 * Small system-level ports the domain layer needs but must not implement
 * itself (real implementations touch the system clock, RNG, etc., and are
 * wired in by the application/CLI/web entry points).
 */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
}
