import type { Logger, LogLevel } from "@recoverai/core";

/** Minimal console-backed implementation of the core `Logger` port. */
export class CliLogger implements Logger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const line = `[${level}] ${message}`;
    const payload = context ? [line, context] : [line];

    switch (level) {
      case "error":
        console.error(...payload);
        return;
      case "warn":
        console.warn(...payload);
        return;
      default:
        console.info(...payload);
    }
  }
}
