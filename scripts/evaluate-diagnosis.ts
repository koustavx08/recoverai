/**
 * Diagnosis Agent evaluation harness.
 *
 * Runs the real `GroundedDiagnosisAgent` (LLM-assisted if AI_API_KEY/AI_MODEL
 * are configured, deterministic fallback otherwise — same agent the CLI and
 * dashboard use, not a special-cased evaluation-only code path) against
 * every case in data/evaluation/diagnosis-cases.json and reports actual,
 * computed results. Nothing here is hardcoded or fabricated — every number
 * in the report is derived from the agent's real output for each case.
 *
 * Usage:
 *   pnpm evaluate:diagnosis
 *
 * Requires @recoverai/{core,config,database,integrations,agents} to be
 * built (dist/ present) — same requirement as `recoverai agent --stage
 * diagnosis` via the built CLI.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { brand, type Logger } from "@recoverai/core";
import {
  GroundedDiagnosisAgent,
  diagnosisSchema,
  type DiagnosisInput,
} from "@recoverai/agents";
import { loadConfig } from "@recoverai/config";
import { AnthropicProvider } from "@recoverai/integrations";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, "../data/evaluation/diagnosis-cases.json");

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
  riskScore: z.number().optional(),
  recoverabilityScore: z.number().optional(),
  customerHistory: z
    .object({
      totalTransactions: z.number(),
      successfulTransactions: z.number(),
      reliabilityScore: z.number(),
    })
    .optional(),
  expectedCategory: z.enum([
    "issuer_decline",
    "insufficient_funds",
    "upi_failure",
    "network_timeout",
    "expired_card",
    "repeated_failure",
    "checkout_abandonment",
    "refund_related",
    "non_retryable",
    "insufficient_evidence",
    "unknown",
  ]),
});
type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

const silentLogger: Logger = { log: () => {} };

function toDiagnosisInput(evalCase: EvaluationCase): DiagnosisInput {
  return {
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
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const cases = z.array(evaluationCaseSchema).parse(raw);

  const config = loadConfig();
  const provider =
    config.ai.isConfigured && config.ai.apiKey && config.ai.model
      ? new AnthropicProvider({ apiKey: config.ai.apiKey, model: config.ai.model })
      : null;
  const agent = new GroundedDiagnosisAgent({ provider });

  let correct = 0;
  let incorrect = 0;
  let invalidOutputs = 0;
  let unsupportedInterventions = 0;
  let llmModeCount = 0;
  const mismatches: string[] = [];

  for (const evalCase of cases) {
    const input = toDiagnosisInput(evalCase);
    const outcome = await agent.diagnose(input, { logger: silentLogger });

    const parsed = diagnosisSchema.safeParse(outcome.diagnosis);
    if (!parsed.success) {
      invalidOutputs++;
      continue;
    }

    if (outcome.meta.mode === "llm") llmModeCount++;

    if (!input.retryable && outcome.diagnosis.interventionEligibility.includes("RETRY")) {
      unsupportedInterventions++;
    }
    if (!input.retryable && outcome.diagnosis.retryRecommendation.recommended) {
      unsupportedInterventions++;
    }

    if (outcome.diagnosis.category === evalCase.expectedCategory) {
      correct++;
    } else {
      incorrect++;
      mismatches.push(
        `  - ${evalCase.transactionId} (${evalCase.name}): expected "${evalCase.expectedCategory}", got "${outcome.diagnosis.category}"`,
      );
    }
  }

  const accuracy = cases.length > 0 ? (correct / cases.length) * 100 : 0;

  const lines: string[] = [];
  lines.push("Diagnosis Evaluation");
  lines.push("");
  lines.push(`Cases: ${cases.length}`);
  lines.push("");
  lines.push(`Correct category: ${correct}`);
  lines.push(`Incorrect category: ${incorrect}`);
  lines.push("");
  lines.push(`Accuracy: ${accuracy.toFixed(1)}%`);
  lines.push("");
  lines.push(`Invalid outputs: ${invalidOutputs}`);
  lines.push(`Unsupported interventions: ${unsupportedInterventions}`);
  lines.push("");
  lines.push(`Mode: ${llmModeCount > 0 ? `${llmModeCount}/${cases.length} cases ran AI-assisted` : "all cases ran deterministic fallback (no AI credentials configured)"}`);

  if (mismatches.length > 0) {
    lines.push("");
    lines.push("Mismatches:");
    lines.push(...mismatches);
  }

  console.info(lines.join("\n"));

  if (invalidOutputs > 0 || unsupportedInterventions > 0) {
    process.exitCode = 1;
  }
}

void main();
