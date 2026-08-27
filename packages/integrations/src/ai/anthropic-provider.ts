import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  AIModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "./provider.js";

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Structured-output `AIModelProvider` backed by the Anthropic API.
 *
 * Forces the model to respond through exactly one tool call matching the
 * caller's Zod schema (`tool_choice: { type: "tool" }`), then validates
 * the tool call's input against that schema before returning — the model
 * cannot return free-form prose here, and a response that doesn't
 * validate is a thrown error, not silently accepted.
 *
 * Safety boundary: this provider exposes no tool to the model other than
 * the caller's own output schema. It makes one non-agentic request per
 * call — no multi-turn tool loop, no file access, no network access, no
 * ability for the model to call back out to anything.
 */
export class AnthropicProvider implements AIModelProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const startedAt = Date.now();

    const inputSchema = zodToJsonSchema(request.schema, {
      $refStrategy: "none",
    }) as Record<string, unknown>;
    delete inputSchema.$schema;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 2048,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      tools: [
        {
          name: request.schemaName,
          description: request.schemaDescription,
          // The SDK requires its own narrow `Tool.InputSchema` shape (a `type: "object"`
          // literal); `zod-to-json-schema` gives us a structurally-equivalent plain object.
          input_schema: inputSchema as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: request.schemaName },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(
        `Anthropic response for schema "${request.schemaName}" did not include the expected tool call.`,
      );
    }

    const data = request.schema.parse(toolUse.input);

    return {
      data,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      latencyMs: Date.now() - startedAt,
    };
  }
}
