/**
 * Full RecoveryPipeline evaluation harness.
 *
 * Runs the real, complete six-stage `RecoveryPipeline` (Detection ->
 * Prioritization -> Diagnosis -> Strategy -> Recovery Simulation ->
 * Verification — the same orchestrator `recoverai pipeline run` uses)
 * against every case in data/evaluation/pipeline-cases.json and reports
 * actual, computed results. Unlike the diagnosis/strategy/recovery
 * evaluation harnesses, this one does not hand-construct any intermediate
 * stage output — every `PipelineTransactionFacts` goes through the real
 * agents end to end.
 *
 * Usage:
 *   pnpm evaluate:pipeline
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { brand, type Logger } from "@recoverai/core";
import {
  BatchRecoveryPipeline,
  DeterministicDetectionAgent,
  DeterministicPrioritizationAgent,
  DeterministicVerificationAgent,
  GroundedDiagnosisAgent,
  GroundedStrategyAgent,
  RecoveryPipeline,
  SimulatedRecoveryAgent,
  detectionResultSchema,
  diagnosisSchema,
  prioritizationResultSchema,
  recoveryExecutionResultSchema,
  recoveryVerificationResultSchema,
  riskPrioritySchema,
  strategyDecisionSchema,
  type PipelineResult,
  type PipelineTransactionFacts,
  type RecoveryPipelineAgents,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { AnthropicProvider, RecoveryExecutionSimulator, type AIModelProvider } from "@recoverai/integrations";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, "../data/evaluation/pipeline-cases.json");

const evaluationCaseSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
  status: z.enum(["succeeded", "failed", "pending", "refunded", "abandoned"]),
  amount: z.object({ amount: z.number(), currency: z.string() }),
  paymentMethod: z.enum(["card", "upi", "netbanking", "wallet", "emi", "bank_transfer", "unknown"]),
  attemptCount: z.number().int().min(0),
  failureCode: z
    .enum([
      "issuer_decline",
      "insufficient_funds",
      "expired_card",
      "invalid_card",
      "invalid_payment_details",
      "upi_failure",
      "network_timeout",
      "processor_error",
      "risk_blocked",
      "customer_abandoned",
      "authentication_failed",
      "duplicate_attempt",
      "unknown",
    ])
    .optional(),
  failureDescription: z.string().optional(),
  retryable: z.boolean().optional(),
  riskScore: z.number().optional(),
  recoverabilityScore: z.number().optional(),
  customerHistory: z
    .object({
      totalTransactions: z.number(),
      successfulTransactions: z.number(),
      reliabilityScore: z.number(),
    })
    .optional(),
  hasSucceededWithAlternateMethod: z.boolean().optional(),
  seed: z.string(),
  expectedPipelineStatus: z.enum(["completed", "blocked", "skipped", "failed"]),
  expectedActionable: z.boolean(),
  expectedPriority: riskPrioritySchema.optional(),
  expectedExecutionConstraint: z.enum(["zero", "success_only"]),
});
type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

const silentLogger: Logger = { log: () => {} };

/** Mirrors @recoverai/analysis's risk-scorer.ts computePriority() thresholds exactly (that function isn't exported, so the fixed, documented thresholds are duplicated here for this synthetic fixture — not a re-derivation of risk scoring itself, just the priority tier a real RevenueRisk would already carry). */
function computePriority(riskScore: number, recoverabilityScore: number): "critical" | "high" | "medium" | "low" {
  if (riskScore >= 80 && recoverabilityScore >= 60) return "critical";
  if (riskScore >= 60 && recoverabilityScore >= 40) return "high";
  if (riskScore >= 35 || recoverabilityScore >= 25) return "medium";
  return "low";
}

function toFacts(evalCase: EvaluationCase): PipelineTransactionFacts {
  // Mirrors @recoverai/analysis's scoreTransaction(): expectedRecoveryAmount
  // = amount * (recoverabilityScore / 100). Not re-derived risk scoring —
  // just the same, already-established formula applied to this fixture's
  // own riskScore/recoverabilityScore inputs, exactly as the real CLI
  // service does from a real RevenueRisk.
  const expectedRecoveryAmount =
    evalCase.recoverabilityScore !== undefined
      ? {
          amount: Math.round(evalCase.amount.amount * (evalCase.recoverabilityScore / 100)),
          currency: evalCase.amount.currency,
        }
      : undefined;

  return {
    transactionId: brand(evalCase.transactionId),
    status: evalCase.status,
    amount: evalCase.amount,
    paymentMethod: evalCase.paymentMethod,
    attemptCount: evalCase.attemptCount,
    failureCode: evalCase.failureCode,
    failureDescription: evalCase.failureDescription,
    retryable: evalCase.retryable,
    riskScore: evalCase.riskScore,
    recoverabilityScore: evalCase.recoverabilityScore,
    expectedRecoveryAmount,
    priority:
      evalCase.riskScore !== undefined && evalCase.recoverabilityScore !== undefined
        ? computePriority(evalCase.riskScore, evalCase.recoverabilityScore)
        : undefined,
    customerHistory: evalCase.customerHistory,
    hasSucceededWithAlternateMethod: evalCase.hasSucceededWithAlternateMethod,
    seed: evalCase.seed,
  };
}

function buildAgents(provider: AIModelProvider | null): RecoveryPipelineAgents {
  return {
    detection: new DeterministicDetectionAgent(),
    diagnosis: new GroundedDiagnosisAgent({ provider }),
    prioritization: new DeterministicPrioritizationAgent(),
    strategy: new GroundedStrategyAgent({ provider }),
    recovery: new SimulatedRecoveryAgent({ simulationProvider: new RecoveryExecutionSimulator() }),
    verification: new DeterministicVerificationAgent(),
  };
}

function hasInvalidStageOutput(result: PipelineResult): boolean {
  if (result.detection && !detectionResultSchema.safeParse(result.detection.result).success) return true;
  if (result.prioritization && !prioritizationResultSchema.safeParse(result.prioritization.result).success) return true;
  if (result.diagnosis && !diagnosisSchema.safeParse(result.diagnosis.diagnosis).success) return true;
  if (result.strategy && !strategyDecisionSchema.safeParse(result.strategy.decision).success) return true;
  if (result.execution && !recoveryExecutionResultSchema.safeParse(result.execution.result).success) return true;
  if (result.verification && !recoveryVerificationResultSchema.safeParse(result.verification.verification).success)
    return true;
  return false;
}

function violatesExecutionConstraint(result: PipelineResult, constraint: "zero" | "success_only"): boolean {
  const amount = result.execution?.result.recoveredAmount.amount;
  if (amount === undefined) return false;
  if (constraint === "zero") return amount !== 0;
  // "success_only": zero unless outcome is success, in which case it must be > 0.
  if (result.execution?.result.outcome === "success") return !(amount > 0);
  return amount !== 0;
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const cases = z.array(evaluationCaseSchema).parse(raw);

  const config = loadConfig();
  const provider =
    config.ai.isConfigured && config.ai.apiKey && config.ai.model
      ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
      : null;

  const agents = buildAgents(provider);
  const pipeline = new RecoveryPipeline(agents, { logger: silentLogger });
  const batchPipeline = new BatchRecoveryPipeline(pipeline);

  const factsList = cases.map(toFacts);
  const batch = await batchPipeline.run(factsList);
  const repeat = await batchPipeline.run(factsList); // same seeds — for consistency check

  let statusCorrect = 0;
  let statusIncorrect = 0;
  let policyViolations = 0;
  let invalidOutputs = 0;
  let verificationFailures = 0;
  let consistentRuns = 0;
  const mismatches: string[] = [];

  for (let i = 0; i < cases.length; i++) {
    const evalCase = cases[i];
    const result = batch.results[i];
    const repeated = repeat.results[i];
    if (!evalCase || !result || !repeated) continue;

    if (result.status === evalCase.expectedPipelineStatus) statusCorrect++;
    else {
      statusIncorrect++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected status "${evalCase.expectedPipelineStatus}", got "${result.status}"`,
      );
    }

    const actualActionable = result.detection?.result.actionable ?? false;
    if (actualActionable !== evalCase.expectedActionable) {
      policyViolations++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected actionable=${evalCase.expectedActionable}, got ${actualActionable}`,
      );
    }

    if (evalCase.expectedPriority && result.prioritization?.result.priority !== evalCase.expectedPriority) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected priority "${evalCase.expectedPriority}", got "${result.prioritization?.result.priority ?? "none"}"`,
      );
    }

    if (violatesExecutionConstraint(result, evalCase.expectedExecutionConstraint)) {
      policyViolations++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): recoveredAmount violates constraint "${evalCase.expectedExecutionConstraint}"`,
      );
    }

    if (hasInvalidStageOutput(result)) {
      invalidOutputs++;
      mismatches.push(`  - ${evalCase.transactionId} (${evalCase.name}): a stage produced schema-invalid output`);
    }

    if (result.verification && !result.verification.verification.verified) {
      verificationFailures++;
    }

    const consistent =
      result.status === repeated.status &&
      result.execution?.result.outcome === repeated.execution?.result.outcome &&
      result.execution?.result.recoveredAmount.amount === repeated.execution?.result.recoveredAmount.amount;
    if (consistent) consistentRuns++;
    else {
      mismatches.push(`  - ${evalCase.transactionId} (${evalCase.name}): same seed produced different results across two runs`);
    }
  }

  const statusAccuracy = cases.length > 0 ? (statusCorrect / cases.length) * 100 : 0;
  const simulationConsistency = cases.length > 0 ? (consistentRuns / cases.length) * 100 : 0;

  const lines: string[] = [];
  lines.push("Pipeline Evaluation");
  lines.push("");
  lines.push(`Cases: ${cases.length}`);
  lines.push("");
  lines.push(`Completed: ${batch.completed}`);
  lines.push(`Blocked: ${batch.blocked}`);
  lines.push(`Skipped: ${batch.skipped}`);
  lines.push(`Failed: ${batch.failed}`);
  lines.push("");
  lines.push(`Expected status correct: ${statusCorrect}`);
  lines.push(`Expected status incorrect: ${statusIncorrect}`);
  lines.push("");
  lines.push(`Status accuracy: ${statusAccuracy.toFixed(1)}%`);
  lines.push("");
  lines.push(`Policy violations: ${policyViolations}`);
  lines.push(`Invalid outputs: ${invalidOutputs}`);
  lines.push(`Verification failures: ${verificationFailures}`);
  lines.push("");
  lines.push(`Simulation consistency: ${simulationConsistency.toFixed(1)}%`);

  if (mismatches.length > 0) {
    lines.push("");
    lines.push("Mismatches:");
    lines.push(...mismatches);
  }

  console.info(lines.join("\n"));

  if (statusIncorrect > 0 || policyViolations > 0 || invalidOutputs > 0) {
    process.exitCode = 1;
  }
}

void main();
