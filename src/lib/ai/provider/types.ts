import type { TokenUsage } from "@/lib/usage/meter";

/** LLM providers Collective Brain can route to. All are Anthropic-Messages-compatible. */
export type ProviderId = "anthropic" | "kimi" | "glm";

/** A structured (forced tool-use / JSON) request — used by distillation. */
export interface StructuredRequest {
  model: string;
  system: string;
  /** Name of the single tool the model is forced to call. */
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input (the structured payload we want back). */
  inputSchema: Record<string, unknown>;
  userText: string;
  maxTokens: number;
}

export interface StructuredResult<T> {
  /** Parsed tool input, or null if the model produced no structured block. */
  data: T | null;
  /** True if the model refused the request. */
  refused: boolean;
  usage: TokenUsage;
}

/** A streaming text request — used by Ask. */
export interface StreamRequest {
  model: string;
  system: string;
  userText: string;
  maxTokens: number;
}

/** Consumes a streaming answer: iterate for text deltas, then read final usage. */
export interface StreamHandle extends AsyncIterable<{ text: string }> {
  /** Resolves once the stream is fully consumed. */
  finalUsage(): Promise<TokenUsage>;
}

/** The provider-neutral surface both call sites (distill, ask) go through. */
export interface LlmProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Does this provider have the credentials it needs (API key)? */
  isConfigured(): boolean;
  structured<T>(req: StructuredRequest): Promise<StructuredResult<T>>;
  stream(req: StreamRequest): StreamHandle;
}
