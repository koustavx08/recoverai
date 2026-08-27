import { basename } from "node:path";
import type { AnalysisResult, IngestionSummary } from "@recoverai/analysis";
import type { FailureReasonCode, TransactionStatus } from "@recoverai/core";
import type {
  DiagnosedResult,
  PipelineBatchResult,
  PipelineSingleResult,
  RecoveredResult,
  StrategizedResult,
} from "../services/types.js";
import { formatCount, formatMoney } from "./format.js";

const STATUS_LABELS: Readonly<Record<TransactionStatus, string>> = {
  succeeded: "Successful",
  failed: "Failed",
  pending: "Pending",
  refunded: "Refunded",
  abandoned: "Abandoned",
};

const FAILURE_LABELS: Readonly<Record<FailureReasonCode, string>> = {
  issuer_decline: "Issuer decline",
  insufficient_funds: "Insufficient funds",
  expired_card: "Expired card",
  invalid_card: "Invalid card",
  invalid_payment_details: "Invalid payment details",
  upi_failure: "UPI failure",
  network_timeout: "Timeout",
  processor_error: "Processor error",
  risk_blocked: "Risk blocked",
  customer_abandoned: "Abandonment",
  authentication_failed: "Authentication failed",
  duplicate_attempt: "Duplicate attempt",
  unknown: "Unknown",
};

function line(label: string, value: string, labelWidth = 22): string {
  return `  ${label.padEnd(labelWidth)} ${value}`;
}

export function printIngestionSummary(summary: IngestionSummary): void {
  const out: string[] = [];
  out.push("RecoverAI Ingestion");
  out.push("");
  out.push(`File: ${basename(summary.file)}`);
  out.push("");
  out.push("Records:");
  out.push(line("Total:", formatCount(summary.totalRecords)));
  out.push(line("Valid:", formatCount(summary.validRecords)));
  out.push(line("Invalid:", formatCount(summary.invalidRecords)));
  out.push("");
  out.push("Amount:");
  out.push(line("Total GMV:", formatMoney(summary.totalGmv)));
  out.push("");
  out.push("Status:");
  for (const [status, count] of Object.entries(summary.statusBreakdown)) {
    out.push(line(`${STATUS_LABELS[status as TransactionStatus]}:`, formatCount(count)));
  }

  if (summary.issues.length > 0) {
    out.push("");
    out.push("Issues:");
    for (const issue of summary.issues.slice(0, 5)) {
      const idPart = issue.recordId ? ` (${issue.recordId})` : "";
      out.push(`  Row ${issue.row}${idPart}: ${issue.reason}`);
    }
    if (summary.issues.length > 5) {
      out.push(`  ...and ${summary.issues.length - 5} more.`);
    }
  }

  out.push("");
  out.push(
    summary.invalidRecords === 0
      ? "✓ Ingestion completed"
      : "⚠ Ingestion completed with rejected records",
  );

  console.info(out.join("\n"));
}

export function printAnalysisTable(result: AnalysisResult): void {
  const out: string[] = [];
  out.push("RecoverAI Revenue Analysis");
  out.push("");
  out.push(`Transactions analyzed: ${formatCount(result.transactionCount)}`);
  out.push("");
  out.push("Revenue:");
  out.push(line("Total GMV:", formatMoney(result.revenue.totalGmv), 24));
  out.push(line("Successful:", formatMoney(result.revenue.successfulAmount), 24));
  out.push(line("Revenue at risk:", formatMoney(result.revenue.revenueAtRiskAmount), 24));
  out.push(
    line(
      "Estimated recoverable:",
      formatMoney(result.revenue.estimatedRecoverableAmount),
      24,
    ),
  );

  const failureEntries = Object.entries(result.failureBreakdown).sort(
    ([, a], [, b]) => b - a,
  );
  if (failureEntries.length > 0) {
    out.push("");
    out.push("Failed / abandoned:");
    for (const [code, count] of failureEntries) {
      out.push(
        line(`${FAILURE_LABELS[code as FailureReasonCode]}:`, formatCount(count), 24),
      );
    }
  }

  out.push("");
  out.push("Recovery candidates:");
  out.push(line("Critical:", formatCount(result.priorityBreakdown.critical), 24));
  out.push(line("High:", formatCount(result.priorityBreakdown.high), 24));
  out.push(line("Medium:", formatCount(result.priorityBreakdown.medium), 24));
  out.push(line("Low:", formatCount(result.priorityBreakdown.low), 24));

  const top = result.candidates[0];
  out.push("");
  if (top) {
    out.push("Top recovery opportunity:");
    out.push(line("Transaction:", top.transactionId, 20));
    out.push(
      line("Amount:", formatMoney(top.expectedRecoveryAmount), 20) +
        " (expected recovery)",
    );
    out.push(line("Risk:", `${top.riskScore}/100`, 20));
    out.push(line("Recoverability:", `${top.recoverabilityScore}/100`, 20));
  } else {
    out.push("No recovery candidates in this dataset.");
  }

  out.push("");
  out.push(
    'Note: "Estimated recoverable" is a deterministic projection, not confirmed recovered revenue. No recovery action has been executed.',
  );

  console.info(out.join("\n"));
}

export function printAnalysisJson(result: AnalysisResult): void {
  console.info(JSON.stringify(result, null, 2));
}

function describeMode(result: DiagnosedResult): string {
  const { meta } = result;
  if (meta.mode === "llm") {
    return `AI-assisted (provider: ${meta.provider ?? "unknown"}, model: ${meta.model ?? "unknown"})`;
  }
  return meta.fallbackReason
    ? `Deterministic fallback (${meta.fallbackReason})`
    : "Deterministic fallback";
}

export function printDiagnosis(result: DiagnosedResult): void {
  const { diagnosis } = result;
  const out: string[] = [];

  out.push("RecoverAI Diagnosis Agent");
  out.push("");
  out.push(line("Transaction:", result.transactionId, 24));
  out.push(line("Amount:", formatMoney(result.amount), 24));
  out.push(line("Failure:", FAILURE_LABELS[result.failureCode], 24));
  out.push("");
  out.push(line("Diagnosis category:", diagnosis.category, 24));
  out.push(line("Recoverability:", diagnosis.recoverabilityAssessment, 24));
  out.push(line("Confidence:", `${Math.round(diagnosis.confidence * 100)}%`, 24));
  out.push(
    line(
      "Retry recommended:",
      diagnosis.retryRecommendation.recommended
        ? `yes (up to ${diagnosis.retryRecommendation.maxAttempts} more attempt(s))`
        : "no",
      24,
    ),
  );
  out.push(line("Eligible interventions:", diagnosis.interventionEligibility.join(", "), 24));
  out.push("");
  out.push("Why:");
  out.push(`  ${diagnosis.explanation}`);
  out.push("");
  out.push("Evidence:");
  for (const item of diagnosis.evidence) {
    out.push(`  - [${item.id}] ${item.fact}`);
  }

  if (diagnosis.limitations.length > 0) {
    out.push("");
    out.push("Uncertainty / limitations:");
    for (const limitation of diagnosis.limitations) {
      out.push(`  - ${limitation}`);
    }
  }

  out.push("");
  out.push(`Mode: ${describeMode(result)}`);
  out.push("");
  out.push(
    'Note: this is a structured diagnosis and bounded recommendation only. No action has been executed and no money has been recovered.',
  );

  console.info(out.join("\n"));
}

export function printDiagnosisJson(result: DiagnosedResult): void {
  console.info(
    JSON.stringify(
      {
        transactionId: result.transactionId,
        amount: result.amount,
        failureCode: result.failureCode,
        diagnosis: result.diagnosis,
        meta: result.meta,
      },
      null,
      2,
    ),
  );
}

function describeStrategyMode(result: StrategizedResult): string {
  const { meta } = result;
  if (meta.mode === "llm") {
    return `AI-assisted (provider: ${meta.provider ?? "unknown"}, model: ${meta.model ?? "unknown"})`;
  }
  return meta.fallbackReason
    ? `Deterministic fallback (${meta.fallbackReason})`
    : "Deterministic fallback";
}

export function printStrategy(result: StrategizedResult): void {
  const { decision } = result;
  const out: string[] = [];

  out.push("RecoverAI Strategy Decision");
  out.push("");
  out.push(line("Transaction:", result.transactionId, 22));
  out.push(line("Diagnosis:", result.diagnosis.category, 22));
  out.push(line("Risk:", `${result.riskScore}/100`, 22));
  out.push(line("Recoverability:", `${result.recoverabilityScore}/100`, 22));
  out.push("");
  out.push("Selected strategy:");
  out.push(`  ${decision.strategy}`);
  out.push("");
  out.push(line("Confidence:", `${Math.round(decision.confidence * 100)}%`, 22));
  out.push(line("Human approval:", decision.requiresHumanApproval ? "required" : "not required", 22));
  out.push("");
  out.push("Rationale:");
  out.push(`  ${decision.rationale}`);
  out.push("");
  out.push("Expected outcome:");
  out.push(`  ${decision.expectedOutcome}`);

  if (decision.constraints.length > 0) {
    out.push("");
    out.push("Constraints applied:");
    for (const constraint of decision.constraints) {
      out.push(`  - ${constraint}`);
    }
  }

  out.push("");
  out.push("Supporting evidence:");
  for (const item of decision.supportingEvidence) {
    out.push(`  - [${item.id}] ${item.fact}`);
  }

  if (decision.limitations.length > 0) {
    out.push("");
    out.push("Limitations:");
    for (const limitation of decision.limitations) {
      out.push(`  - ${limitation}`);
    }
  }

  out.push("");
  out.push(`Mode: ${describeStrategyMode(result)}`);
  out.push("");
  out.push(
    "Note: this is a strategy recommendation only. No recovery action has been executed and no money has been recovered.",
  );

  console.info(out.join("\n"));
}

export function printStrategyJson(result: StrategizedResult): void {
  console.info(
    JSON.stringify(
      {
        transactionId: result.transactionId,
        diagnosis: result.diagnosis,
        riskScore: result.riskScore,
        recoverabilityScore: result.recoverabilityScore,
        decision: result.decision,
        meta: result.meta,
      },
      null,
      2,
    ),
  );
}

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  success: "SUCCESS (simulated)",
  failure: "FAILURE (simulated)",
  pending: "PENDING (requires human approval)",
  blocked: "BLOCKED (policy)",
  not_executed: "NOT EXECUTED",
};

export function printRecovery(result: RecoveredResult): void {
  const { execution, verification, decision } = result;
  const out: string[] = [];

  out.push("RECOVERY EXECUTION");
  out.push("");
  out.push("Mode:");
  out.push("  SIMULATION");
  out.push("");
  out.push("  No real payment provider connected. No real Razorpay action occurred.");
  out.push("");
  out.push(line("Transaction:", result.transactionId, 22));
  out.push(line("Diagnosis:", result.diagnosis.category, 22));
  out.push(line("Strategy:", decision.strategy, 22));
  out.push(line("Action:", execution.action, 22));
  out.push("");
  out.push("Execution:");
  out.push(line("Outcome:", OUTCOME_LABELS[execution.outcome] ?? execution.outcome, 22));
  if (execution.blockedReason) out.push(line("Blocked reason:", execution.blockedReason, 22));
  out.push("");

  if (execution.outcome === "success") {
    out.push("SIMULATED RECOVERY:");
    out.push(`  ${formatMoney(execution.recoveredAmount)}`);
  } else {
    out.push("SIMULATED RECOVERY:");
    out.push(`  ${formatMoney(execution.recoveredAmount)} (no recovery — outcome was "${execution.outcome}")`);
  }
  out.push("");

  out.push("Verification:");
  out.push(`  ${verification.verified ? "PASSED" : "FAILED"}`);
  if (verification.reasons.length > 0) {
    for (const reason of verification.reasons) out.push(`  - ${reason}`);
  }
  out.push("");
  out.push(`Audit: executionId=${execution.executionId}`);
  out.push("");
  out.push("No real money was moved. All figures above are SIMULATED.");

  console.info(out.join("\n"));
}

export function printRecoveryJson(result: RecoveredResult): void {
  console.info(
    JSON.stringify(
      {
        transactionId: result.transactionId,
        diagnosis: result.diagnosis,
        decision: result.decision,
        execution: result.execution,
        executionMeta: result.executionMeta,
        verification: result.verification,
        simulated: true,
      },
      null,
      2,
    ),
  );
}

const SEPARATOR = "─".repeat(24);

function stageLine(label: string, value: string | undefined): string {
  return value !== undefined ? line(`${label}:`, value, 22) : line(`${label}:`, "—", 22);
}

export function printPipelineSingle(result: PipelineSingleResult): void {
  const { result: pipeline } = result;
  const out: string[] = [];

  out.push("RECOVERAI PIPELINE");
  out.push("");
  out.push("Mode:");
  out.push("  SIMULATION ONLY");
  out.push("");
  out.push(line("Transaction:", pipeline.transactionId, 20));
  out.push(line("Status:", pipeline.status.toUpperCase(), 20));
  if (pipeline.statusReason) out.push(line("Reason:", pipeline.statusReason, 20));

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("Detection");
  out.push("");
  out.push(stageLine("Detected", pipeline.detection ? String(pipeline.detection.result.detected) : undefined));
  out.push(stageLine("Actionable", pipeline.detection ? String(pipeline.detection.result.actionable) : undefined));
  out.push(stageLine("Severity", pipeline.detection?.result.severity));

  if (pipeline.prioritization) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Prioritization");
    out.push("");
    out.push(stageLine("Priority", pipeline.prioritization.result.priority));
    out.push(stageLine("Score", String(pipeline.prioritization.result.score)));
  }

  if (pipeline.diagnosis) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Diagnosis");
    out.push("");
    out.push(stageLine("Category", pipeline.diagnosis.diagnosis.category));
    out.push(stageLine("Confidence", `${Math.round(pipeline.diagnosis.diagnosis.confidence * 100)}%`));
    out.push(stageLine("Mode", pipeline.diagnosis.meta.mode));
  }

  if (pipeline.strategy) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Strategy");
    out.push("");
    out.push(stageLine("Selected", pipeline.strategy.decision.strategy));
    out.push(
      stageLine("Human approval", pipeline.strategy.decision.requiresHumanApproval ? "required" : "not required"),
    );
    out.push(stageLine("Mode", pipeline.strategy.meta.mode));
  }

  if (pipeline.execution) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Recovery Simulation");
    out.push("");
    out.push(stageLine("Action", pipeline.execution.result.action));
    out.push(stageLine("Outcome", pipeline.execution.result.outcome));
    out.push("");
    out.push("SIMULATED RECOVERY:");
    out.push(`  ${formatMoney(pipeline.execution.result.recoveredAmount)}`);
  }

  if (pipeline.verification) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Verification");
    out.push("");
    out.push(stageLine("Result", pipeline.verification.verification.verified ? "PASSED" : "FAILED"));
  }

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("No real money was moved. All figures above are SIMULATED.");

  console.info(out.join("\n"));
}

export function printPipelineSingleJson(result: PipelineSingleResult): void {
  console.info(JSON.stringify({ result: result.result, simulated: true }, null, 2));
}

export function printPipelineBatch(result: PipelineBatchResult): void {
  const { batch } = result;
  const { metrics } = batch;
  const out: string[] = [];

  out.push("RECOVERAI BATCH RECOVERY");
  out.push("");
  out.push("Mode:");
  out.push("  SIMULATION ONLY");
  out.push("");
  out.push(`File: ${basename(result.file)}`);
  out.push("");
  out.push(`Transactions processed: ${formatCount(batch.total)}`);

  let ignored = 0;
  let detectionBlocked = 0;
  let actionable = 0;
  for (const pipelineResult of batch.results) {
    const detected = pipelineResult.detection?.result.detected;
    const act = pipelineResult.detection?.result.actionable;
    if (!detected) ignored++;
    else if (!act) detectionBlocked++;
    else actionable++;
  }

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("Detection");
  out.push("");
  out.push(line("Actionable:", formatCount(actionable), 14));
  out.push(line("Ignored:", formatCount(ignored), 14));
  out.push(line("Blocked:", formatCount(detectionBlocked), 14));

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("Prioritization");
  out.push("");
  out.push(line("Critical:", formatCount(metrics.priorityBreakdown.critical), 14));
  out.push(line("High:", formatCount(metrics.priorityBreakdown.high), 14));
  out.push(line("Medium:", formatCount(metrics.priorityBreakdown.medium), 14));
  out.push(line("Low:", formatCount(metrics.priorityBreakdown.low), 14));

  const diagnosisEntries = Object.entries(metrics.diagnosisBreakdown).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  if (diagnosisEntries.length > 0) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Diagnosis");
    out.push("");
    for (const [category, count] of diagnosisEntries) {
      out.push(line(`${category}:`, formatCount(count ?? 0), 22));
    }
  }

  const strategyEntries = Object.entries(metrics.strategyBreakdown).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  if (strategyEntries.length > 0) {
    out.push("");
    out.push(SEPARATOR);
    out.push("");
    out.push("Strategy");
    out.push("");
    for (const [strategy, count] of strategyEntries) {
      out.push(line(`${strategy}:`, formatCount(count ?? 0), 22));
    }
  }

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("Recovery Simulation");
  out.push("");
  const executed = metrics.executionBreakdown.success + metrics.executionBreakdown.failure;
  out.push(line("Executed:", formatCount(executed), 20));
  out.push(line("Blocked:", formatCount(metrics.executionBreakdown.blocked), 20));
  if (metrics.executionBreakdown.pending > 0) {
    out.push(line("Pending approval:", formatCount(metrics.executionBreakdown.pending), 20));
  }
  if (metrics.executionBreakdown.not_executed > 0) {
    out.push(line("No action:", formatCount(metrics.executionBreakdown.not_executed), 20));
  }
  out.push("");
  out.push(line("Simulated successes:", formatCount(metrics.executionBreakdown.success), 20));
  out.push(line("Simulated failures:", formatCount(metrics.executionBreakdown.failure), 20));

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("SIMULATED RECOVERY");
  out.push("");
  out.push("Revenue at risk:");
  out.push(`  ${formatMoney(metrics.revenueAtRisk)}`);
  out.push("");
  out.push("Simulated recovered:");
  out.push(`  ${formatMoney(metrics.simulatedRecoveredAmount)}`);
  out.push("");
  out.push("Simulation recovery rate:");
  out.push(`  ${metrics.simulationRecoveryRate.toFixed(1)}%`);

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("Verification");
  out.push("");
  out.push(line("Passed:", formatCount(metrics.verificationPassed), 14));
  out.push(line("Failed:", formatCount(metrics.verificationFailed), 14));

  out.push("");
  out.push(SEPARATOR);
  out.push("");
  out.push("No real money was moved. All figures above are SIMULATED — not confirmed recovered revenue.");

  console.info(out.join("\n"));
}

export function printPipelineBatchJson(result: PipelineBatchResult): void {
  console.info(JSON.stringify({ file: result.file, batch: result.batch, simulated: true }, null, 2));
}
