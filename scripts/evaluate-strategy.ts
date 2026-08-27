/**
 * Strategy Agent evaluation harness.
 *
 * Runs the real `GroundedStrategyAgent` (LLM-assisted if AI_API_KEY/AI_MODEL
 * are configured, deterministic fallback otherwise — same agent the CLI and
 * dashboard use) against every case in data/evaluation/strategy-cases.json
 * and reports actual, computed results. Each case's underlying `Diagnosis`
 * is itself produced by the real deterministic diagnosis engine (facts +
 * evidence + `buildDeterministicDiagnosis`) from the case's transaction-like
 * fields — never hand-authored — so evidence ids are always real and
 * grounding checks are meaningful. `overrideDiagnosisCategory` lets a case
 * force a specific diagnosis category (used only for "insufficient_evidence",
 * which is unreachable through normal derivation once a risk score is
 * present — exactly as it always is once real risk-scoring has run).
 *
 * Usage:
 *   pnpm evaluate:strategy
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { brand, type Logger } from "@recoverai/core";
import {
  GroundedStrategyAgent,
  buildDeterministicDiagnosis,
  buildDiagnosisEvidence,
  buildDiagnosisFacts,
  buildStrategyPolicyContext,
  diagnosisCategorySchema,
  strategyDecisionSchema,
  recoveryStrategyTypeSchema,
  type Diagnosis,
  type DiagnosisInput,
  type StrategyInput,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { AnthropicProvider } from "@recoverai/integrations";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, "../data/evaluation/strategy-cases.json");

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
  priority: z.enum(["critical", "high", "medium", "low"]),
  hasSucceededWithAlternateMethod: z.boolean().optional(),
  overrideDiagnosisCategory: diagnosisCategorySchema.optional(),
  expectedAllowedStrategies: z.array(recoveryStrategyTypeSchema).min(1),
  expectedPreferredStrategy: recoveryStrategyTypeSchema,
  expectedHumanApproval: z.boolean(),
});
type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

const silentLogger: Logger = { log: () => {} };

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((item) => bSet.has(item));
}

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

  if (evalCase.overrideDiagnosisCategory) {
    return { ...diagnosis, category: evalCase.overrideDiagnosisCategory };
  }
  return diagnosis;
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const cases = z.array(evaluationCaseSchema).parse(raw);

  const config = loadConfig();
  const provider =
    config.ai.isConfigured && config.ai.apiKey && config.ai.model
      ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
      : null;
  const agent = new GroundedStrategyAgent({ provider });

  let validOutputs = 0;
  let invalidOutputs = 0;
  let preferredCorrect = 0;
  let preferredIncorrect = 0;
  let policyViolations = 0;
  let unsupportedStrategies = 0;
  let groundingViolations = 0;
  let llmModeCount = 0;
  const mismatches: string[] = [];

  for (const evalCase of cases) {
    const diagnosis = buildCaseDiagnosis(evalCase);

    const strategyInput: StrategyInput = {
      transactionId: brand(evalCase.transactionId),
      diagnosis,
      amount: evalCase.amount,
      riskScore: evalCase.riskScore,
      recoverabilityScore: evalCase.recoverabilityScore,
      expectedRecoveryAmount: {
        amount: Math.round(evalCase.amount.amount * (evalCase.recoverabilityScore / 100)),
        currency: evalCase.amount.currency,
      },
      priority: evalCase.priority,
      attemptCount: evalCase.attemptCount,
      retryable: evalCase.retryable,
      hasSucceededWithAlternateMethod: evalCase.hasSucceededWithAlternateMethod,
    };

    const outcome = await agent.selectStrategy(strategyInput, { logger: silentLogger });
    const parsed = strategyDecisionSchema.safeParse(outcome.decision);
    if (!parsed.success) {
      invalidOutputs++;
      continue;
    }
    validOutputs++;
    if (outcome.meta.mode === "llm") llmModeCount++;

    if (!recoveryStrategyTypeSchema.safeParse(outcome.decision.strategy).success) {
      unsupportedStrategies++;
    }

    const actualPolicy = buildStrategyPolicyContext(strategyInput);
    const policyMismatch =
      !sameSet(actualPolicy.allowedStrategies, evalCase.expectedAllowedStrategies) ||
      !actualPolicy.allowedStrategies.includes(outcome.decision.strategy);
    if (policyMismatch) policyViolations++;

    const knownEvidenceIds = new Set(diagnosis.evidence.map((e) => e.id).concat(["evidence-priority", "evidence-alternate-method-history"]));
    const hasUngroundedEvidence = outcome.decision.supportingEvidence.some(
      (item) => !knownEvidenceIds.has(item.id),
    );
    if (hasUngroundedEvidence) groundingViolations++;

    if (outcome.decision.strategy === evalCase.expectedPreferredStrategy) {
      preferredCorrect++;
    } else {
      preferredIncorrect++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected "${evalCase.expectedPreferredStrategy}", got "${outcome.decision.strategy}" (allowed: ${actualPolicy.allowedStrategies.join(", ")})`,
      );
    }

    if (outcome.decision.requiresHumanApproval !== evalCase.expectedHumanApproval) {
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected requiresHumanApproval=${evalCase.expectedHumanApproval}, got ${outcome.decision.requiresHumanApproval}`,
      );
    }
  }

  const accuracy = cases.length > 0 ? (preferredCorrect / cases.length) * 100 : 0;

  const lines: string[] = [];
  lines.push("Strategy Evaluation");
  lines.push("");
  lines.push(`Cases: ${cases.length}`);
  lines.push("");
  lines.push(`Valid outputs: ${validOutputs}`);
  lines.push(`Invalid outputs: ${invalidOutputs}`);
  lines.push("");
  lines.push(`Preferred strategy correct: ${preferredCorrect}`);
  lines.push(`Preferred strategy incorrect: ${preferredIncorrect}`);
  lines.push("");
  lines.push(`Accuracy: ${accuracy.toFixed(1)}%`);
  lines.push("");
  lines.push(`Policy violations: ${policyViolations}`);
  lines.push(`Unsupported strategies: ${unsupportedStrategies}`);
  lines.push(`Grounding violations: ${groundingViolations}`);
  lines.push("");
  lines.push(`Mode: ${llmModeCount > 0 ? `${llmModeCount}/${cases.length} cases ran AI-assisted` : "all cases ran deterministic fallback (no AI credentials configured)"}`);

  if (mismatches.length > 0) {
    lines.push("");
    lines.push("Mismatches:");
    lines.push(...mismatches);
  }

  console.info(lines.join("\n"));

  if (invalidOutputs > 0 || policyViolations > 0 || unsupportedStrategies > 0 || groundingViolations > 0) {
    process.exitCode = 1;
  }
}

void main();
