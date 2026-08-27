import { z } from "zod";
import type { Logger } from "@recoverai/core";
import {
  DEFAULT_PIPELINE_FILE,
  buildDiagnosisContext,
  buildStrategyContext,
  isCommandResult,
  resolveAIProvider,
} from "./pipeline-context.js";
import { errorResult, notImplemented, type CommandResult } from "./types.js";

/** Used when no --file is given — the canonical, always-available fixture dataset, matching `analyze`'s default. */
export const DEFAULT_AGENT_FILE = DEFAULT_PIPELINE_FILE;

export const agentOptionsSchema = z.object({
  stage: z
    .enum([
      "detection",
      "diagnosis",
      "prioritization",
      "strategy",
      "strategy_selection",
      "recovery_execution",
      "verification",
    ])
    .optional(),
  transaction: z.string().optional(),
  file: z.string().optional(),
  json: z.boolean().optional().default(false),
});
export type AgentOptions = z.infer<typeof agentOptionsSchema>;

async function runDiagnosisStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  if (!options.transaction) {
    return errorResult(
      "agent",
      "--transaction <id> is required for --stage diagnosis, e.g. --transaction txn_00002.",
    );
  }

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveAIProvider();
  const context = await buildDiagnosisContext(options.transaction, filePath, provider, logger, "agent");
  if (isCommandResult(context)) return context;

  const { transaction, failureCode, diagnosisOutcome } = context;
  logger.log("info", "diagnosis agent completed", {
    transactionId: transaction.id,
    mode: diagnosisOutcome.meta.mode,
    fallbackUsed: diagnosisOutcome.meta.fallbackUsed,
    validationSuccess: diagnosisOutcome.meta.validationSuccess,
    latencyMs: diagnosisOutcome.meta.latencyMs,
  });

  return {
    status: "diagnosed",
    command: "agent",
    transactionId: transaction.id,
    amount: transaction.amount,
    failureCode,
    diagnosis: diagnosisOutcome.diagnosis,
    meta: diagnosisOutcome.meta,
    json: options.json,
  };
}

async function runStrategyStage(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  if (!options.transaction) {
    return errorResult(
      "agent",
      "--transaction <id> is required for --stage strategy, e.g. --transaction txn_00002.",
    );
  }

  const filePath = options.file ?? DEFAULT_AGENT_FILE;
  const provider = resolveAIProvider();
  const context = await buildStrategyContext(options.transaction, filePath, provider, logger, "agent");
  if (isCommandResult(context)) return context;

  const { transaction, riskScore, recoverabilityScore, diagnosisOutcome, strategyOutcome } = context;

  logger.log("info", "strategy agent completed", {
    transactionId: transaction.id,
    mode: strategyOutcome.meta.mode,
    strategy: strategyOutcome.decision.strategy,
    fallbackUsed: strategyOutcome.meta.fallbackUsed,
    validationSuccess: strategyOutcome.meta.validationSuccess,
    latencyMs: strategyOutcome.meta.latencyMs,
  });

  return {
    status: "strategized",
    command: "agent",
    transactionId: transaction.id,
    diagnosis: diagnosisOutcome.diagnosis,
    riskScore,
    recoverabilityScore,
    decision: strategyOutcome.decision,
    meta: strategyOutcome.meta,
    json: options.json,
  };
}

/**
 * Runs the "diagnosis" or "strategy" agent stage against a single
 * transaction in a dataset. Every other stage remains not-implemented
 * (Detection/Prioritization aren't wrapped as agents yet — see
 * docs/agent-architecture.md; Recovery Execution/Verification are their
 * own `recoverai recover` command, not an `agent` stage).
 */
export async function runAgent(options: AgentOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "agent service invoked", { stage: options.stage ?? "all" });

  if (options.stage === "diagnosis") return runDiagnosisStage(options, logger);
  if (options.stage === "strategy" || options.stage === "strategy_selection") {
    return runStrategyStage(options, logger);
  }

  return notImplemented(
    "agent",
    options.stage
      ? `The "${options.stage}" agent stage is not implemented yet.`
      : 'Only the "diagnosis" and "strategy" stages are implemented so far. Pass --stage diagnosis|strategy --transaction <id>. For recovery execution (simulated), use `recoverai recover`.',
  );
}
