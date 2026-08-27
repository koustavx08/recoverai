import type { AIModelProvider } from "@recoverai/integrations";
import type {
  DiagnosisAgent,
  DiagnosisExecutionMeta,
  DiagnosisOutcome,
} from "../agents/diagnosis-agent.js";
import type { AgentContext } from "../agents/types.js";
import { DIAGNOSIS_AGENT_VERSION, buildDeterministicDiagnosis } from "./deterministic-diagnosis.js";
import { buildDiagnosisEvidence } from "./evidence.js";
import { buildDiagnosisFacts } from "./facts.js";
import { DiagnosisPromptBuilder } from "./prompt-builder.js";
import type { Diagnosis, EvidenceItem } from "./schema.js";
import { llmDiagnosisResponseSchema } from "./schema.js";
import type { DiagnosisInput } from "./types.js";
import { validateLlmDiagnosisResponse } from "./validation.js";

export interface GroundedDiagnosisAgentOptions {
  /** `null` means "no AI provider configured" — the agent always runs deterministically in that case, never pretending otherwise. */
  readonly provider: AIModelProvider | null;
}

/**
 * The Diagnosis Agent: FACTS -> deterministic intelligence -> EVIDENCE ->
 * (optional) GenAI reasoning -> STRUCTURED DIAGNOSIS -> BOUNDED
 * RECOMMENDATION. Never the other way around — the LLM is a reasoning layer
 * over facts the deterministic engine already established, not the source
 * of those facts. See docs/agent-architecture.md.
 *
 * Safety boundary: this agent never executes a payment, sends a message,
 * modifies a transaction, retries anything, or accesses arbitrary
 * files/URLs/secrets. It only ever returns a structured `Diagnosis`.
 */
export class GroundedDiagnosisAgent implements DiagnosisAgent {
  readonly id = "diagnosis-agent";
  private readonly promptBuilder = new DiagnosisPromptBuilder();

  constructor(private readonly options: GroundedDiagnosisAgentOptions) {}

  async diagnose(input: DiagnosisInput, context: AgentContext): Promise<DiagnosisOutcome> {
    const facts = buildDiagnosisFacts(input);
    const evidence = buildDiagnosisEvidence(input, facts);

    if (!this.options.provider) {
      return this.deterministicOutcome(input, facts, evidence, {
        fallbackReason: "AI provider is not configured (AI_API_KEY/AI_MODEL unset).",
        validationSuccess: true,
      });
    }

    const provider = this.options.provider;
    const knownEvidenceIds = new Set(evidence.map((e) => e.id));
    const startedAt = Date.now();

    try {
      const { system, prompt } = this.promptBuilder.build({ input, facts, evidence });
      const result = await provider.generateStructured({
        system,
        prompt,
        schema: llmDiagnosisResponseSchema,
        schemaName: "diagnosis",
        schemaDescription:
          "A structured, evidence-grounded diagnosis of a failed payment transaction.",
      });
      const latencyMs = Date.now() - startedAt;

      const validation = validateLlmDiagnosisResponse(result.data, input, knownEvidenceIds);
      if (!validation.ok) {
        context.logger.log(
          "warn",
          "diagnosis agent: AI output failed grounding validation, falling back",
          { transactionId: input.transactionId, reason: validation.reason },
        );
        return this.deterministicOutcome(input, facts, evidence, {
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

      const diagnosis: Diagnosis = {
        transactionId: input.transactionId,
        category: result.data.category,
        confidence: result.data.confidence,
        evidence: resolvedEvidence,
        recoverabilityAssessment: result.data.recoverabilityAssessment,
        retryRecommendation: result.data.retryRecommendation,
        interventionEligibility: result.data.interventionEligibility,
        explanation: result.data.explanation,
        limitations: result.data.limitations,
        metadata: {
          mode: "llm",
          provider: provider.name,
          model: result.model,
          agentVersion: DIAGNOSIS_AGENT_VERSION,
          generatedAt: new Date().toISOString(),
          fallbackUsed: false,
        },
      };

      context.logger.log("info", "diagnosis agent: llm diagnosis produced", {
        transactionId: input.transactionId,
        mode: "llm",
        model: result.model,
        latencyMs,
      });

      const meta: DiagnosisExecutionMeta = {
        mode: "llm",
        provider: provider.name,
        model: result.model,
        latencyMs,
        validationSuccess: true,
        fallbackUsed: false,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      };
      return { diagnosis, meta };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      context.logger.log("warn", "diagnosis agent: AI provider call failed, falling back", {
        transactionId: input.transactionId,
        reason,
      });
      return this.deterministicOutcome(input, facts, evidence, {
        fallbackReason: `AI provider error: ${reason}`,
        provider: provider.name,
        model: null,
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  private deterministicOutcome(
    input: DiagnosisInput,
    facts: ReturnType<typeof buildDiagnosisFacts>,
    evidence: readonly EvidenceItem[],
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
  ): DiagnosisOutcome {
    const diagnosis = buildDeterministicDiagnosis(input, facts, evidence, {
      fallbackReason: options.fallbackReason,
    });
    const meta: DiagnosisExecutionMeta = {
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
    return { diagnosis, meta };
  }
}
