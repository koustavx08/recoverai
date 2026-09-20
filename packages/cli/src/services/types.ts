import type { IngestionSummary, AnalysisResult } from "@recoverai/analysis";
import type {
  BatchPipelineResult,
  DetectionResult,
  Diagnosis,
  DiagnosisExecutionMeta,
  PipelineResult,
  PrioritizationResult,
  RecoveryExecutionMeta,
  RecoveryExecutionResult,
  RecoveryVerificationResult,
  StrategyDecision,
  StrategyExecutionMeta,
} from "@recoverai/agents";
import type { FailureReasonCode, Money, PaymentMethod } from "@recoverai/core";

export type CommandName =
  "init" | "ingest" | "analyze" | "simulate" | "recover" | "report" | "agent" | "pipeline";

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

export interface DetectedResult {
  readonly status: "detected";
  readonly command: "agent";
  readonly transactionId: string;
  readonly result: DetectionResult;
  readonly latencyMs: number;
  readonly json: boolean;
}

export interface PrioritizedResult {
  readonly status: "prioritized";
  readonly command: "agent";
  readonly transactionId: string;
  readonly result: PrioritizationResult;
  readonly latencyMs: number;
  readonly json: boolean;
}

export interface RecoveryExecutedResult {
  readonly status: "recovery_executed";
  readonly command: "agent";
  readonly transactionId: string;
  readonly diagnosis: Diagnosis;
  readonly decision: StrategyDecision;
  readonly execution: RecoveryExecutionResult;
  readonly executionMeta: RecoveryExecutionMeta;
  readonly json: boolean;
}

export interface AgentVerifiedResult {
  readonly status: "agent_verified";
  readonly command: "agent";
  readonly transactionId: string;
  readonly execution: RecoveryExecutionResult;
  readonly verification: RecoveryVerificationResult;
  readonly json: boolean;
}

export interface RecoveredResult {
  readonly status: "recovered";
  readonly command: "recover";
  readonly transactionId: string;
  readonly diagnosis: Diagnosis;
  readonly decision: StrategyDecision;
  readonly execution: RecoveryExecutionResult;
  readonly executionMeta: RecoveryExecutionMeta;
  readonly verification: RecoveryVerificationResult;
  readonly json: boolean;
}

export interface PipelineSingleResult {
  readonly status: "pipeline_single";
  readonly command: "pipeline";
  readonly result: PipelineResult;
  readonly json: boolean;
}

export interface PipelineBatchResult {
  readonly status: "pipeline_batch";
  readonly command: "pipeline";
  readonly file: string;
  readonly batch: BatchPipelineResult;
  readonly json: boolean;
}

export interface SimulateSample {
  readonly transactionId: string;
  readonly paymentMethod: PaymentMethod;
  readonly succeeded: boolean;
  readonly failureReasonCode?: string;
}

export interface SimulatedResult {
  readonly status: "simulated";
  readonly command: "simulate";
  readonly count: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly successRate: number;
  readonly failureBreakdown: Readonly<Record<string, number>>;
  readonly sample: readonly SimulateSample[];
}

export interface ReportedResult {
  readonly status: "reported";
  readonly command: "report";
  readonly file: string;
  readonly batch: BatchPipelineResult;
  readonly format: "table" | "json";
}

export type CommandResult =
  | NotImplementedResult
  | OkResult
  | ErrorResult
  | IngestedResult
  | AnalyzedResult
  | DetectedResult
  | PrioritizedResult
  | DiagnosedResult
  | StrategizedResult
  | RecoveryExecutedResult
  | AgentVerifiedResult
  | RecoveredResult
  | PipelineSingleResult
  | PipelineBatchResult
  | SimulatedResult
  | ReportedResult;

export function notImplemented(
  command: CommandName,
  detail?: string,
): NotImplementedResult {
  return { status: "not_implemented", command, detail };
}

export function errorResult(command: CommandName, message: string): ErrorResult {
  return { status: "error", command, message };
}
