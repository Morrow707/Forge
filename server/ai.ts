const apiKey = process.env.ANTHROPIC_API_KEY;
const defaultModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Cheaper/faster model for narrow, low-judgment tasks (pick one ID from a
// short enum-constrained list, extrapolate a number from a trend) where a
// bigger model buys no real quality gain -- pass { model: fastModel } from
// the call site. Overridable so a self-hosted instance without Haiku access
// can point this at the same model as everything else.
export const fastModel = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001";

// Every AI feature in the app is a no-op until ANTHROPIC_API_KEY is set --
// same graceful-degrade pattern as Resend (email.ts) and VAPID (push.ts).
// Nothing here ever blocks a request or crashes the server on failure; a
// missing/failed AI call just means that feature quietly has nothing to show.
export const aiEnabled = Boolean(apiKey);
if (!aiEnabled) {
  console.warn("AI coach disabled: ANTHROPIC_API_KEY not set.");
}

/** A system prompt can be a plain string, or a list of blocks where the
 * caller marks which prefix is safe to cache -- e.g. the large, byte-
 * identical-for-everyone programming/nutrition principles blocks, split out
 * from the small per-request bits (an athlete's profile, admin-taught
 * guidelines that occasionally change) that would otherwise bust the cache
 * on every single call. Mark the LAST block that should be cached; Anthropic
 * caches everything up to and including it. Only bother for blocks past the
 * ~1024-token minimum -- caching a tiny prompt just adds overhead. */
export type SystemPrompt = string | { text: string; cache?: boolean }[];

function buildSystemField(system: SystemPrompt) {
  if (typeof system === "string") return system;
  return system.map((block) => ({
    type: "text" as const,
    text: block.text,
    ...(block.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

type CallOptions = { maxTokens?: number; model?: string };

// One shared retry policy for every Claude call in the app: a network
// hiccup or a 5xx (overloaded/internal error) is worth one retry after a
// short delay, since it's transient and the alternative is the human paying
// for a second full request themselves after seeing a silent failure. A 4xx
// (bad request, auth, invalid tool schema) means retrying gets the exact
// same rejection again -- that's a bug, not a blip, so it fails immediately
// instead of doubling the cost of finding out.
async function callAnthropic(body: Record<string, unknown>): Promise<any | null> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey!,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        const retryable = res.status >= 500;
        console.error(`Claude request failed (attempt ${attempt + 1}):`, res.status, text);
        if (retryable && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        return null;
      }
      const data = await res.json();
      // A response cut off mid-generation means the text/tool `input` is
      // incomplete or truncated-garbage JSON -- treating that as a real
      // result is how a truncated "emit the complete structure" response
      // ends up silently deleting whatever didn't fit. Every caller gets
      // the same "couldn't do it, try again" failure they'd get from any
      // other bad response, never corrupt data.
      if (data.stop_reason === "max_tokens") {
        console.error("Claude request truncated at max_tokens -- discarding partial result");
        return null;
      }
      return data;
    } catch (err: any) {
      console.error(`Claude request failed (attempt ${attempt + 1}):`, err?.message || err);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Plain-text completion -- digests, chat replies, anything meant to be read
 * as prose rather than parsed as data. Returns null if AI isn't configured
 * or the request fails; callers should treat that the same as "no insight
 * available yet," never surface it as an error to the user. */
export async function askClaude(
  system: SystemPrompt,
  messages: { role: "user" | "assistant"; content: string }[],
  { maxTokens = 1024, model }: CallOptions = {},
): Promise<string | null> {
  if (!aiEnabled) return null;
  const data = await callAnthropic({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages,
  });
  if (!data) return null;
  const text = data.content?.find((b: any) => b.type === "text")?.text;
  return typeof text === "string" ? text : null;
}

/** Plain-text completion grounded in one or more images -- e.g. frames
 * pulled from a form-check video. Images are plain base64 (no data: URL
 * prefix) with an explicit media type. Returns null on no-config/failure,
 * same contract as askClaude. */
export async function askClaudeVision(
  system: SystemPrompt,
  text: string,
  images: { mediaType: "image/jpeg" | "image/png"; data: string }[],
  { maxTokens = 1024, model }: CallOptions = {},
): Promise<string | null> {
  if (!aiEnabled) return null;
  const data = await callAnthropic({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          })),
          { type: "text", text },
        ],
      },
    ],
  });
  if (!data) return null;
  const textBlock = data.content?.find((b: any) => b.type === "text")?.text;
  return typeof textBlock === "string" ? textBlock : null;
}

/** Structured extraction via forced tool use -- the reliable way to get
 * Claude to return actual JSON matching a shape, rather than asking for JSON
 * in prose and hoping it parses. Returns null on no-config/failure/refusal.
 * Callers should still validate the result against a zod schema before
 * trusting it -- this only guarantees Claude called the tool, not that every
 * field is the type/shape the tool schema asked for. */
export async function askClaudeStructured<T>(
  system: SystemPrompt,
  userPrompt: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  { maxTokens = 1024, model }: CallOptions = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  const data = await callAnthropic({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages: [{ role: "user", content: userPrompt }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  });
  if (!data) return null;
  const toolUse = data.content?.find((b: any) => b.type === "tool_use");
  return (toolUse?.input as T) ?? null;
}

/** Structured extraction grounded in one or more images -- the vision
 * counterpart to askClaudeStructured, for when the shape Claude should
 * return needs to be reliable JSON (e.g. a list of foods identified in a
 * meal photo) rather than prose describing what it sees. Same
 * validate-before-trusting caveat as askClaudeStructured. */
export async function askClaudeVisionStructured<T>(
  system: SystemPrompt,
  text: string,
  images: { mediaType: "image/jpeg" | "image/png"; data: string }[],
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  { maxTokens = 1024, model }: CallOptions = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  const data = await callAnthropic({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          })),
          { type: "text", text },
        ],
      },
    ],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  });
  if (!data) return null;
  const toolUse = data.content?.find((b: any) => b.type === "tool_use");
  return (toolUse?.input as T) ?? null;
}

/** Like askClaudeStructured, but offers Claude a choice between multiple
 * tools (tool_choice: "auto") instead of forcing exactly one -- lets the
 * model genuinely just reply/ask a question via a no-op tool on a turn
 * where it shouldn't touch anything yet, rather than being forced to
 * produce a real change (or a guess) on every single turn. Returns which
 * tool was called alongside its input so the caller can branch on it; same
 * validate-before-trusting caveat as askClaudeStructured applies.
 *
 * `serverTools` (e.g. web search) run entirely on Anthropic's side and are
 * merged ahead of the custom tools -- their results land as extra content
 * blocks in the same response, so the `tool_use` lookup below still finds
 * our own tool call untouched (a server tool's own invocation block is a
 * differently-typed `server_tool_use`, never `tool_use`). A research
 * tangent can occasionally hit the server's own round-trip cap mid-turn
 * (`stop_reason: "pause_turn"`) before reaching one of our tools -- resume
 * by resending the conversation with the paused turn appended, exactly as
 * Anthropic's own docs describe (never inject a synthetic "continue"
 * message; the API detects the trailing server-tool-use block itself). */
export async function askClaudeWithTools<T = any>(
  system: SystemPrompt,
  userPrompt: string,
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[],
  {
    maxTokens = 1024,
    model,
    serverTools,
    images,
    toolExecutors,
  }: CallOptions & {
    serverTools?: Record<string, unknown>[];
    // Optional -- same base64 image-block shape askClaudeVision already
    // uses. Most tool-calling callers have no image, so this stays a plain
    // string content block unless one's actually attached (e.g. Forge AI's
    // teaching chat, when the admin uploads a photo of a book page).
    images?: { mediaType: "image/jpeg" | "image/png"; data: string }[];
    // Tools this function runs itself and feeds the result back into the
    // conversation, rather than returning to the caller (e.g. Forge AI's
    // fetch_url -- see chatWithForgeAi in storage.ts). Any tool name NOT
    // listed here still returns immediately like before; existing callers
    // that never pass this see no change in behavior at all.
    toolExecutors?: Record<string, (input: any) => Promise<string>>;
  } = {},
): Promise<{ toolName: string; input: T } | null> {
  if (!aiEnabled) return null;
  const allTools = serverTools ? [...serverTools, ...tools] : tools;
  const userContent =
    images && images.length > 0
      ? [
          ...images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          })),
          { type: "text", text: userPrompt },
        ]
      : userPrompt;
  let messages: any[] = [{ role: "user", content: userContent }];
  // A server-executed tool round-trip (fetch a URL, get the text back, let
  // the model keep going) costs one extra attempt each time, so this needs
  // more headroom than the plain pause_turn retry loop alone -- bounded
  // all the same, so a model stuck calling fetch_url in a loop can't spin
  // forever.
  const maxAttempts = toolExecutors ? 8 : 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await callAnthropic({
      model: model || defaultModel,
      max_tokens: maxTokens,
      system: buildSystemField(system),
      messages,
      tools: allTools,
      tool_choice: { type: "auto" },
    });
    if (!data) return null;
    const toolUse = data.content?.find((b: any) => b.type === "tool_use");
    if (toolUse) {
      const executor = toolExecutors?.[toolUse.name];
      if (!executor) return { toolName: toolUse.name as string, input: toolUse.input as T };
      let resultText: string;
      try {
        resultText = await executor(toolUse.input);
      } catch (err) {
        resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages = [
        ...messages,
        { role: "assistant", content: data.content },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUse.id, content: resultText }],
        },
      ];
      continue;
    }
    if (data.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: data.content }];
      continue;
    }
    return null;
  }
  return null;
}
