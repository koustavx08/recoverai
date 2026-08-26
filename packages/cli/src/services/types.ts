import type { IngestionSummary, AnalysisResult } from "@recoverai/analysis";

export type CommandName =
  "init" | "ingest" | "analyze" | "simulate" | "recover" | "report" | "agent";

export interface NotImplementedResult {
  readonly status: "not_implemented";
  readonly command: CommandName;
  readonly detail?: string;
}

export interface OkResult {
  readonly status: "ok";
  readonly command: CommandName;
  readonly message: string;
}

export interface ErrorResult {
  readonly status: "error";
  readonly command: CommandName;
  readonly message: string;
}

export interface IngestedResult {
  readonly status: "ingested";
  readonly command: "ingest";
  readonly summary: IngestionSummary;
}

export interface AnalyzedResult {
  readonly status: "analyzed";
  readonly command: "analyze";
  readonly result: AnalysisResult;
  readonly json: boolean;
}

export type CommandResult =
  NotImplementedResult | OkResult | ErrorResult | IngestedResult | AnalyzedResult;

export function notImplemented(
  command: CommandName,
  detail?: string,
): NotImplementedResult {
  return { status: "not_implemented", command, detail };
}

export function errorResult(command: CommandName, message: string): ErrorResult {
  return { status: "error", command, message };
}
