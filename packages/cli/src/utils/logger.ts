import type { Logger, LogLevel } from "@recoverai/core";

/**
 * Minimal console-backed implementation of the core `Logger` port.
 * Everything goes to stderr, regardless of level — stdout is reserved for
 * a command's actual output (an ingestion summary, an analysis table, or
 * `--json`), which must stay parseable when piped into another tool.
 */
export class CliLogger implements Logger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const line = `[${level}] ${message}`;
    const payload = context ? [line, context] : [line];
    console.error(...payload);
  }
}
