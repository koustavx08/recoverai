import type { IngestionSummary, AnalysisResult } from "@recoverai/analysis";
import type {
  Diagnosis,
  DiagnosisExecutionMeta,
  StrategyDecision,
  StrategyExecutionMeta,
} from "@recoverai/agents";
import type { FailureReasonCode, Money } from "@recoverai/core";

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

export interface DiagnosedResult {
  readonly status: "diagnosed";
  readonly command: "agent";
  readonly transactionId: string;
  readonly amount: Money;
  readonly failureCode: FailureReasonCode;
  readonly diagnosis: Diagnosis;
  readonly meta: DiagnosisExecutionMeta;
  readonly json: boolean;
}

export interface StrategizedResult {
  readonly status: "strategized";
  readonly command: "agent";
  readonly transactionId: string;
  readonly diagnosis: Diagnosis;
  readonly riskScore: number;
  readonly recoverabilityScore: number;
  readonly decision: StrategyDecision;
  readonly meta: StrategyExecutionMeta;
  readonly json: boolean;
}

export type CommandResult =
  | NotImplementedResult
  | OkResult
  | ErrorResult
  | IngestedResult
  | AnalyzedResult
  | DiagnosedResult
  | StrategizedResult;

export function notImplemented(
  command: CommandName,
  detail?: string,
): NotImplementedResult {
  return { status: "not_implemented", command, detail };
}

export function errorResult(command: CommandName, message: string): ErrorResult {
  return { status: "error", command, message };
}
