import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  ProviderId,
  StreamHandle,
  StreamRequest,
  StructuredRequest,
  StructuredResult,
} from "./types";

/** Static wiring for one Anthropic-Messages-compatible provider. */
export interface AnthropicCompatConfig {
  id: ProviderId;
  label: string;
  /** Env var holding the API key (e.g. ANTHROPIC_API_KEY, MOONSHOT_API_KEY). */
  apiKeyEnv: string;
  /**
   * Base URL for the Messages API. Undefined = the Anthropic SDK default
   * (api.anthropic.com). Kimi/GLM point this at their Anthropic-compat endpoint.
   */
  baseURL?: string;
}

/**
 * A provider backed by the Anthropic SDK, parameterised by base URL + key.
 * Anthropic itself uses the default endpoint; Kimi (Moonshot) and GLM (Zhipu)
 * expose Anthropic-compatible endpoints, so the same message/tool/stream code
 * paths carry over — only the base URL, key, and model ids differ.
 */
export class AnthropicCompatProvider implements LlmProvider {
  constructor(private readonly cfg: AnthropicCompatConfig) {}

  get id(): ProviderId {
    return this.cfg.id;
  }
  get label(): string {
    return this.cfg.label;
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.cfg.apiKeyEnv]);
  }

  private client(): Anthropic {
    const apiKey = process.env[this.cfg.apiKeyEnv];
    if (!apiKey) throw new Error(`${this.cfg.apiKeyEnv} is not set`);
    return new Anthropic({ apiKey, baseURL: this.cfg.baseURL });
  }

  async structured<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const client = this.client();
    const tool = {
      name: req.toolName,
      description: req.toolDescription,
      input_schema: req.inputSchema,
      // `strict` is an Anthropic guarantee; compat endpoints may reject the
      // field, so only send it for Anthropic itself.
      ...(this.cfg.id === "anthropic" ? { strict: true } : {}),
    } as Anthropic.Tool;

    const res = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      tools: [tool],
      tool_choice: { type: "tool", name: req.toolName },
      messages: [{ role: "user", content: req.userText }],
    });

    const refused = res.stop_reason === "refusal";
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === req.toolName,
    );
    return {
      data: (block?.input as T) ?? null,
      refused,
      usage: {
        model: req.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }

  stream(req: StreamRequest): StreamHandle {
    const client = this.client();
    const messageStream = client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.userText }],
    });

    return {
      async *[Symbol.asyncIterator]() {
        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { text: event.delta.text };
          }
        }
      },
      async finalUsage() {
        const msg = await messageStream.finalMessage();
        return {
          model: msg.model,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
        };
      },
    };
  }
}
