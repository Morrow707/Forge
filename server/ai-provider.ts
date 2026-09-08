/**
 * The seam between Forge and whoever is serving the model.
 *
 * WHY THIS EXISTS
 *
 * The stated intention is not to use one vendor forever. The API coupling
 * itself was never the hard part -- it is one fetch in ai.ts. The hard part
 * is that about thirty-five prompts and their tool schemas live inline in a
 * twenty-three thousand line file, written in one vendor's request shape, so
 * moving engines means touching every one of them.
 *
 * This is the boundary that stops that list growing. Everything above it --
 * every ask* helper, every call site -- speaks in the neutral shapes below.
 * Everything below it is one provider's wire format, in one file, replaced
 * wholesale rather than edited in thirty-five places.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No attempt to abstract over capability differences. A provider without
 * vision, or without forced tool use, is not a drop-in swap and pretending
 * otherwise produces a layer that lies. The shapes here are the ones every
 * serious provider supports; anything else stays a provider concern.
 */

export type NeutralRole = "user" | "assistant";

export type NeutralImage = {
  mediaType: "image/jpeg" | "image/png";
  /** base64, no data: prefix. */
  data: string;
};

export type NeutralMessage = {
  role: NeutralRole;
  text?: string;
  images?: NeutralImage[];
};

/**
 * A system prompt, optionally split so a stable prefix can be cached.
 *
 * The cache flag is a hint, not a demand. A provider with no caching ignores
 * it and everything still works, which is the property that makes this safe
 * to keep in the neutral layer rather than hiding it below the seam.
 */
export type NeutralSystem = string | { text: string; cache?: boolean }[];

export type NeutralTool = {
  name: string;
  description: string;
  /** JSON Schema. Every provider worth using takes this shape. */
  input_schema: Record<string, unknown>;
};

export type NeutralRequest = {
  system: NeutralSystem;
  messages: NeutralMessage[];
  tools?: NeutralTool[];
  maxTokens: number;
  /** Provider-specific id. The caller passes what the configured provider understands. */
  model?: string;
  /** For the usage rollup. Not sent to the provider. */
  feature?: string;
};

export type NeutralUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type NeutralResponse = {
  text: string | null;
  toolCall: { name: string; input: unknown } | null;
  usage: NeutralUsage;
  model: string;
  /**
   * True when generation hit the token ceiling. Callers must treat a
   * truncated response as a failure rather than a result: a half-written
   * tool input is not partially correct data, it is corrupt data that looks
   * like the real thing.
   */
  truncated: boolean;
};

export interface AiProvider {
  readonly name: string;
  readonly defaultModel: string;
  /** A cheaper model for mechanical work, or the default where none exists. */
  readonly fastModel: string;
  readonly supportsVision: boolean;
  send(request: NeutralRequest): Promise<NeutralResponse | null>;
}
