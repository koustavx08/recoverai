/**
 * Recovery Agent evaluation harness.
 *
 * Runs the real `SimulatedRecoveryAgent` + `DeterministicVerificationAgent`
 * (never a real payment provider — see @recoverai/integrations'
 * RecoveryExecutionSimulator) against every case in
 * data/evaluation/recovery-cases.json and reports actual, computed
 * results. Each case's `Diagnosis` is built from the real deterministic
 * diagnosis engine (facts + evidence + buildDeterministicDiagnosis) from
 * the case's transaction-like fields; its `StrategyDecision` is
 * constructed directly from the case's chosen `strategy` (reusing the
 * diagnosis's own evidence for grounding) so this harness focuses on the
 * recovery/execution/verification layer rather than re-testing strategy
 * selection (already covered by evaluate-strategy.ts).
 *
 * Usage:
 *   pnpm evaluate:recovery
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { brand, type Logger } from "@recoverai/core";
import {
  DeterministicVerificationAgent,
  SimulatedRecoveryAgent,
  buildDeterministicDiagnosis,
  buildDiagnosisEvidence,
  buildDiagnosisFacts,
  canExecute,
  diagnosisCategorySchema,
  recoveryExecutionResultSchema,
  recoveryStrategyTypeSchema,
  type Diagnosis,
  type DiagnosisInput,
  type RecoveryExecutionRequest,
  type StrategyDecision,
} from "@recoverai/agents";
import { RecoveryExecutionSimulator } from "@recoverai/integrations";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, "../data/evaluation/recovery-cases.json");

const evaluationCaseSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
  amount: z.object({ amount: z.number(), currency: z.string() }),
  paymentMethod: z.enum(["card", "upi", "netbanking", "wallet", "emi", "bank_transfer", "unknown"]),
  transactionStatus: z.enum(["succeeded", "failed", "pending", "refunded", "abandoned"]),
  attemptCount: z.number().int().min(0),
  failureCode: z.enum([
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
  ]),
  failureDescription: z.string(),
  retryable: z.boolean(),
  riskScore: z.number(),
  recoverabilityScore: z.number(),
  customerHistory: z
    .object({
      totalTransactions: z.number(),
      successfulTransactions: z.number(),
      reliabilityScore: z.number(),
    })
    .optional(),
  overrideDiagnosisCategory: diagnosisCategorySchema.optional(),
  strategy: recoveryStrategyTypeSchema,
  requiresHumanApproval: z.boolean(),
  hasSucceededWithAlternateMethod: z.boolean().optional(),
  seed: z.string(),
  expectedExecutionAllowed: z.boolean(),
  expectedAction: z.enum([
    "auto_retry",
    "notification_email",
    "notification_sms",
    "notification_whatsapp",
    "payment_link",
    "escalate_to_agent",
    "none",
  ]),
  expectedOutcomeConstraints: z.array(z.enum(["success", "failure", "pending", "blocked", "not_executed"])).min(1),
  expectedRecoveredAmountConstraint: z.enum(["zero", "success_only"]),
});
type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

const silentLogger: Logger = { log: () => {} };

function buildCaseDiagnosis(evalCase: EvaluationCase): Diagnosis {
  const diagnosisInput: DiagnosisInput = {
    transactionId: brand(evalCase.transactionId),
    amount: evalCase.amount,
    paymentMethod: evalCase.paymentMethod,
    transactionStatus: evalCase.transactionStatus,
    attemptCount: evalCase.attemptCount,
    failureCode: evalCase.failureCode,
    failureDescription: evalCase.failureDescription,
    retryable: evalCase.retryable,
    riskScore: evalCase.riskScore,
    recoverabilityScore: evalCase.recoverabilityScore,
    customerHistory: evalCase.customerHistory,
  };
  const facts = buildDiagnosisFacts(diagnosisInput);
  const evidence = buildDiagnosisEvidence(diagnosisInput, facts);
  const diagnosis = buildDeterministicDiagnosis(diagnosisInput, facts, evidence);
  return evalCase.overrideDiagnosisCategory
    ? { ...diagnosis, category: evalCase.overrideDiagnosisCategory }
    : diagnosis;
}

function buildCaseStrategyDecision(evalCase: EvaluationCase, diagnosis: Diagnosis): StrategyDecision {
  return {
    transactionId: evalCase.transactionId,
    strategy: evalCase.strategy,
    confidence: 0.5,
    rationale: `Evaluation fixture: testing recovery execution for strategy "${evalCase.strategy}".`,
    supportingEvidence: diagnosis.evidence,
    expectedOutcome: "Evaluation fixture — not a real projection.",
    constraints: [],
    requiresHumanApproval: evalCase.requiresHumanApproval,
    limitations: [],
    metadata: {
      mode: "deterministic",
      provider: null,
      model: null,
      agentVersion: "evaluation-fixture",
      generatedAt: new Date().toISOString(),
      fallbackUsed: true,
      fallbackReason: "Constructed directly by the recovery evaluation harness, not by GroundedStrategyAgent.",
    },
  };
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const cases = z.array(evaluationCaseSchema).parse(raw);

  const recoveryAgent = new SimulatedRecoveryAgent({
    simulationProvider: new RecoveryExecutionSimulator(),
  });
  const verificationAgent = new DeterministicVerificationAgent();

  let policyAllowed = 0;
  let policyBlocked = 0;
  let validResults = 0;
  let invalidResults = 0;
  let verificationPassed = 0;
  let verificationFailed = 0;
  let consistentRuns = 0;
  const mismatches: string[] = [];

  for (const evalCase of cases) {
    const diagnosis = buildCaseDiagnosis(evalCase);
    const strategyDecision = buildCaseStrategyDecision(evalCase, diagnosis);

    const request: RecoveryExecutionRequest = {
      transactionId: brand(evalCase.transactionId),
      amount: evalCase.amount,
      paymentMethod: evalCase.paymentMethod,
      attemptCount: evalCase.attemptCount,
      diagnosis,
      strategyDecision,
      expectedRecoveryAmount: {
        amount: Math.round(evalCase.amount.amount * (evalCase.recoverabilityScore / 100)),
        currency: evalCase.amount.currency,
      },
      hasSucceededWithAlternateMethod: evalCase.hasSucceededWithAlternateMethod,
      executionContext: { simulationMode: true, seed: evalCase.seed },
    };

    const policyDecision = canExecute(request);
    if (policyDecision.allowed) policyAllowed++;
    else policyBlocked++;

    if (policyDecision.allowed !== evalCase.expectedExecutionAllowed) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected executionAllowed=${evalCase.expectedExecutionAllowed}, got ${policyDecision.allowed}`,
      );
    }
    const actualAction = policyDecision.allowed ? policyDecision.plan.action : undefined;

    const outcome = await recoveryAgent.executeRecovery(request, { logger: silentLogger });
    const parsed = recoveryExecutionResultSchema.safeParse(outcome.result);
    if (parsed.success) validResults++;
    else invalidResults++;

    if (actualAction !== undefined && actualAction !== evalCase.expectedAction) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected action "${evalCase.expectedAction}", got "${actualAction}"`,
      );
    }

    if (!evalCase.expectedOutcomeConstraints.includes(outcome.result.outcome)) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): outcome "${outcome.result.outcome}" not in expected [${evalCase.expectedOutcomeConstraints.join(", ")}]`,
      );
    }

    const amountOk =
      evalCase.expectedRecoveredAmountConstraint === "zero"
        ? outcome.result.recoveredAmount.amount === 0
        : outcome.result.outcome === "success"
          ? outcome.result.recoveredAmount.amount > 0
          : outcome.result.recoveredAmount.amount === 0;
    if (!amountOk) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): recoveredAmount ${outcome.result.recoveredAmount.amount} violates constraint "${evalCase.expectedRecoveredAmountConstraint}" for outcome "${outcome.result.outcome}"`,
      );
    }

    const verification = await verificationAgent.verifyRecovery(outcome.result, { logger: silentLogger });
    if (verification.verification.verified) verificationPassed++;
    else {
      verificationFailed++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): verification failed: ${verification.verification.reasons.join("; ")}`,
      );
    }

    // Simulation consistency: same transaction + strategy + seed must reproduce the same result.
    const repeat = await recoveryAgent.executeRecovery(request, { logger: silentLogger });
    const consistent =
      repeat.result.outcome === outcome.result.outcome &&
      repeat.result.recoveredAmount.amount === outcome.result.recoveredAmount.amount;
    if (consistent) consistentRuns++;
    else {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): same seed produced different results across two runs`,
      );
    }
  }

  const simulationConsistency = cases.length > 0 ? (consistentRuns / cases.length) * 100 : 0;

  const lines: string[] = [];
  lines.push("Recovery Evaluation");
  lines.push("");
  lines.push(`Cases: ${cases.length}`);
  lines.push("");
  lines.push(`Policy allowed: ${policyAllowed}`);
  lines.push(`Policy blocked: ${policyBlocked}`);
  lines.push("");
  lines.push(`Valid execution results: ${validResults}`);
  lines.push(`Invalid execution results: ${invalidResults}`);
  lines.push("");
  lines.push(`Verification passed: ${verificationPassed}`);
  lines.push(`Verification failed: ${verificationFailed}`);
  lines.push("");
  lines.push(`Simulation consistency: ${simulationConsistency.toFixed(1)}%`);

  if (mismatches.length > 0) {
    lines.push("");
    lines.push("Mismatches:");
    lines.push(...mismatches);
  }

  console.info(lines.join("\n"));

  if (invalidResults > 0 || verificationFailed > 0 || mismatches.length > 0) {
    process.exitCode = 1;
  }
}

void main();
