import type { AIModelProvider } from "@recoverai/integrations";
import type {
  StrategyAgent,
  StrategyExecutionMeta,
  StrategyOutcome,
} from "../agents/strategy-agent.js";
import type { AgentContext } from "../agents/types.js";
import { STRATEGY_AGENT_VERSION, buildDeterministicStrategy } from "./deterministic-strategy.js";
import { buildStrategyEvidence } from "./evidence.js";
import { buildStrategyPolicyContext, requiresHumanApproval } from "./policy.js";
import type { EvidenceItem } from "../diagnosis/schema.js";
import { StrategyPromptBuilder } from "./prompt-builder.js";
import type { StrategyDecision } from "./schema.js";
import { llmStrategyResponseSchema } from "./schema.js";
import type { StrategyInput } from "./types.js";
import { validateLlmStrategyResponse } from "./validation.js";
import { redactSecrets } from "../security/redact-secrets.js";

export interface GroundedStrategyAgentOptions {
  /** `null` means "no AI provider configured" — the agent always runs deterministically in that case, never pretending otherwise. */
  readonly provider: AIModelProvider | null;
}

/**
 * The Strategy Agent: Diagnosis + deterministic risk context -> policy-
 * approved candidate strategies (`StrategyPolicy`) -> EVIDENCE (reused from
 * diagnosis, plus a few strategy-specific facts) -> optional GenAI
 * reasoning -> STRUCTURED STRATEGY DECISION. The model can only choose from
 * the policy-approved candidate set for this specific transaction — never
 * an arbitrary member of the bounded strategy enum, and never something
 * the deterministic policy has already excluded (e.g. a retry against a
 * non-retryable failure). See docs/agent-architecture.md.
 *
 * Safety boundary: this agent never executes a payment, sends a message,
 * modifies a transaction, or accesses arbitrary files/URLs/secrets. It
 * only ever returns a structured `StrategyDecision` — a recommendation,
 * never an action. Recovery execution is a later phase.
 */
export class GroundedStrategyAgent implements StrategyAgent {
  readonly id = "strategy-agent";
  private readonly promptBuilder = new StrategyPromptBuilder();

  constructor(private readonly options: GroundedStrategyAgentOptions) {}

  async selectStrategy(input: StrategyInput, context: AgentContext): Promise<StrategyOutcome> {
    const evidence = buildStrategyEvidence(input);
    const policy = buildStrategyPolicyContext(input);

    if (!this.options.provider) {
      return this.deterministicOutcome(input, evidence, policy, {
        fallbackReason: "AI provider is not configured (AI_API_KEY/AI_MODEL unset).",
        validationSuccess: true,
      });
    }

    const provider = this.options.provider;
    const knownEvidenceIds = new Set(evidence.map((e) => e.id));
    const startedAt = Date.now();

    try {
      const { system, prompt } = this.promptBuilder.build({
        input,
        evidence,
        allowedStrategies: policy.allowedStrategies,
        constraints: policy.constraints,
      });
      const result = await provider.generateStructured({
        system,
        prompt,
        schema: llmStrategyResponseSchema,
        schemaName: "strategy_decision",
        schemaDescription:
          "A structured, evidence-grounded, policy-approved recovery strategy decision.",
      });
      const latencyMs = Date.now() - startedAt;

      const validation = validateLlmStrategyResponse(
        result.data,
        input,
        knownEvidenceIds,
        policy.allowedStrategies,
      );
      if (!validation.ok) {
        context.logger.log(
          "warn",
          "strategy agent: AI output failed grounding/policy validation, falling back",
          { transactionId: input.transactionId, reason: validation.reason },
        );
        return this.deterministicOutcome(input, evidence, policy, {
          fallbackReason: `AI output rejected: ${validation.reason}`,
          provider: provider.name,
          model: result.model,
          latencyMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        });
      }

      const resolvedEvidence: EvidenceItem[] = result.data.evidenceIds
        .map((id) => evidence.find((e) => e.id === id))
        .filter((e): e is EvidenceItem => e !== undefined);

      const decision: StrategyDecision = {
        transactionId: input.transactionId,
        strategy: result.data.strategy,
        confidence: result.data.confidence,
        rationale: result.data.rationale,
        supportingEvidence: resolvedEvidence,
        expectedOutcome: result.data.expectedOutcome,
        // Deterministic-only fields — never taken from the model, even when the LLM path succeeds.
        constraints: [...policy.constraints],
        requiresHumanApproval: requiresHumanApproval(result.data.strategy),
        limitations: result.data.limitations,
        metadata: {
          mode: "llm",
          provider: provider.name,
          model: result.model,
          agentVersion: STRATEGY_AGENT_VERSION,
          generatedAt: new Date().toISOString(),
          fallbackUsed: false,
        },
      };

      context.logger.log("info", "strategy agent: llm decision produced", {
        transactionId: input.transactionId,
        mode: "llm",
        model: result.model,
        strategy: decision.strategy,
        latencyMs,
      });

      const meta: StrategyExecutionMeta = {
        mode: "llm",
        provider: provider.name,
        model: result.model,
        latencyMs,
        validationSuccess: true,
        fallbackUsed: false,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      };
      return { decision, meta };
    } catch (error) {
      // Redacted: this message originates from the AI provider's SDK, not
      // this codebase, and is about to be persisted (fallbackReason) and
      // rendered on the dashboard — see security/redact-secrets.ts.
      const reason = redactSecrets(error instanceof Error ? error.message : String(error));
      context.logger.log("warn", "strategy agent: AI provider call failed, falling back", {
        transactionId: input.transactionId,
        reason,
      });
      return this.deterministicOutcome(input, evidence, policy, {
        fallbackReason: `AI provider error: ${reason}`,
        provider: provider.name,
        model: null,
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  private deterministicOutcome(
    input: StrategyInput,
    evidence: readonly EvidenceItem[],
    policy: ReturnType<typeof buildStrategyPolicyContext>,
    options: {
      readonly fallbackReason: string;
      /** True only when no AI attempt was made at all (no provider configured) — false whenever an AI response was attempted and then rejected or failed. */
      readonly validationSuccess?: boolean;
      readonly provider?: string;
      readonly model?: string | null;
      readonly latencyMs?: number;
      readonly inputTokens?: number;
      readonly outputTokens?: number;
    },
  ): StrategyOutcome {
    const decision = buildDeterministicStrategy(input, evidence, policy, {
      fallbackReason: options.fallbackReason,
    });
    const meta: StrategyExecutionMeta = {
      mode: "deterministic",
      provider: options.provider ?? null,
      model: options.model ?? null,
      latencyMs: options.latencyMs ?? 0,
      validationSuccess: options.validationSuccess ?? false,
      fallbackUsed: true,
      fallbackReason: options.fallbackReason,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
    };
    return { decision, meta };
  }
}
