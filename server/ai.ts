import { recordAiUsage } from "./ai-usage";
import type { AiProvider, NeutralRequest, NeutralResponse } from "./ai-provider";
import { recordSystemFailure, recordSystemSuccess } from "./system-events";

const apiKey = process.env.ANTHROPIC_API_KEY;
// claude-sonnet-5 -> claude-sonnet-5-5, 2026-10-08. Same price ($2/$10 per
// MTok, cache reads $0.20), same tokenizer, so no cost or token-budget
// re-baselining -- this upgrade is free in money and was NOT free in work:
// Sonnet 5.5 REJECTS a forced tool_choice with a 400, and all three structured
// helpers below asked for one. See acceptsForcedToolChoice and
// callToolForResult -- that is the whole reason this did not ship with the
// Haiku switch.
//
// The other four changes in that generation, each checked against this file
// rather than assumed: thinking `disabled` is a 400 (callAnthropic never sends
// `thinking`, so nothing to change); thinking blocks are now bound to the
// model and the conversation, which only bites a harness that EDITS earlier
// turns -- askClaudeWithTools only ever appends, and it replays the whole
// `data.content` back unmodified, which is what that check wants; the
// `computer_20251124` tool is a 400 (not used anywhere); and the advisor tool
// rejects older advisors (not used). Effort levels are recalibrated but
// nothing here sets `effort`.
export const defaultModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Cheaper/faster model for narrow, low-judgment tasks (pick one ID from a
// short enum-constrained list, extrapolate a number from a trend) where a
// bigger model buys no real quality gain -- pass { model: fastModel } from
// the call site. Overridable so a self-hosted instance without Haiku access
// can point this at the same model as everything else.
//
// claude-haiku-4-5 -> claude-haiku-5-5, 2026-10-08. Newer AND cheaper, so
// this is not a downgrade: $1/$5 per MTok becomes $0.10/$0.50 for prompts of
// 100K tokens or fewer, which every call on this lane is by a wide margin
// (the largest is one downsampled page image). Past 100K it is $0.50/$2.50 --
// still half of what 4.5 cost -- so a future long-context feature on this
// lane gets cheaper too, just less dramatically. The headline 10x overstates
// the saving: 5.5 uses a newer tokenizer and the same text counts about 30%
// more tokens, so the real figure lands nearer 7-8x.
//
// THE ONE BEHAVIOUR CHANGE THAT COULD HAVE BITTEN, AND WHY IT DOES NOT.
// Haiku 4.5 thought only when a request asked it to; 5.5 runs adaptive
// thinking by default, so a response can now BEGIN with thinking blocks and
// those blocks count against max_tokens. That matters here more than
// anywhere, because callAnthropic DISCARDS any response with
// stop_reason "max_tokens" -- a 200-token cap eaten by thinking would not
// error, it would come back null and the feature would quietly do nothing.
// Two things make this lane safe as written and both are load-bearing:
// every helper below finds its block by `type` and never by position, and
// eight of the nine fast call sites go through a FORCED tool_choice, which
// returns the tool call with no thinking block at all. The one free-text
// fast call (pdf-vision.ts, page transcription) runs at 4096. Keep both
// properties if you add a call site here: a free-text fast call with a small
// cap is the shape that breaks, and it breaks silently.
//
// Also removed on 5.5, each a 400 rather than a quiet failure: temperature,
// top_p and top_k at any non-default value, thinking budget_tokens, and an
// assistant prefill. callAnthropic sends none of them (checked 2026-10-08);
// do not add them for this model.
export const fastModel = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5";

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

type CallOptions = {
  maxTokens?: number;
  model?: string;
  // Which part of the app is spending this, for the usage rollup. Optional
  // so no existing call site breaks; anything that omits it lands under
  // "unattributed", which is itself a finding worth seeing on the page.
  feature?: string;
};

// One shared retry policy for every Claude call in the app: a network
// hiccup or a 5xx (overloaded/internal error) is worth one retry after a
// short delay, since it's transient and the alternative is the human paying
// for a second full request themselves after seeing a silent failure. A 4xx
// (bad request, auth, invalid tool schema) means retrying gets the exact
// same rejection again -- that's a bug, not a blip, so it fails immediately
// instead of doubling the cost of finding out.
// A request that fails is recoverable; a request that never returns is not.
// There was no timeout here at all, so a connection that hung rather than
// erroring left the Express handler awaiting forever and the athlete or
// coach watching a spinner that would never resolve -- on a device with
// perfectly good internet. Two minutes is generous for the largest call in
// the app (a 8192-token program draft) and still bounded.
const REQUEST_TIMEOUT_MS = 120_000;

async function callAnthropic(
  body: Record<string, unknown>,
  feature = "unattributed",
): Promise<any | null> {
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
        // AbortSignal.timeout throws a TimeoutError, caught below and
        // treated exactly like a network failure: one retry, then null.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text();
        const retryable = res.status >= 500;
        console.error(`Claude request failed (attempt ${attempt + 1}):`, res.status, text);
        if (retryable && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        // Recorded only once the retry is spent, so a single 500 that the
        // second attempt recovers from never reddens the badge.
        recordSystemFailure("ai", `Claude rejected a request with HTTP ${res.status}`, {
          detail: text.slice(0, 500),
          // A 429 is quota or rate limiting: worth seeing, but that is the
          // plan doing its job rather than something broken.
          severity: res.status === 429 ? "warning" : "error",
        });
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
      // A SAFETY DECLINE IS A 200, NOT AN ERROR. The Sonnet 5.5 / Haiku 5.5
      // generation runs classifiers that can decline a request: HTTP 200,
      // stop_reason "refusal", a stop_details category, and no content. The
      // helpers below would find no text and no tool_use block and return
      // null, which is the right answer for the caller -- but it would be
      // indistinguishable from a timeout, a 500, or a model that simply had
      // nothing to say, in a codebase whose whole AI contract is "null means
      // no insight available". Named here so a decline reads as a decline on
      // the system-health page instead of as a mystery. Warning, not error:
      // this is the classifier doing its job, the same reasoning the 429
      // branch above uses.
      if (data.stop_reason === "refusal") {
        const category = data.stop_details?.category ?? "unspecified";
        console.error(`Claude declined a ${feature} request (${category})`);
        recordSystemFailure("ai", `Claude declined a request (${category})`, {
          detail: String(data.stop_details?.explanation ?? "").slice(0, 500),
          severity: "warning",
        });
        return null;
      }
      recordSystemSuccess("ai");
      // Every model call in the app comes through here, so recording usage
      // at this one point means a feature added later cannot spend money
      // without showing up. Not awaited: a counter must never delay or fail
      // the answer somebody is waiting on.
      const usage = data.usage ?? {};
      void recordAiUsage({
        feature,
        model: String(body.model ?? "unknown"),
        inputTokens: Number(usage.input_tokens ?? 0),
        outputTokens: Number(usage.output_tokens ?? 0),
        cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0),
        cacheWriteTokens: Number(usage.cache_creation_input_tokens ?? 0),
      });
      return data;
    } catch (err: any) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      console.error(
        `Claude request ${timedOut ? "timed out" : "failed"} (attempt ${attempt + 1}):`,
        err?.message || err,
      );
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      recordSystemFailure(
        "ai",
        timedOut
          ? `Claude did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
          : "Could not reach the Claude API",
        { detail: err },
      );
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
  { maxTokens = 1024, model, feature }: CallOptions = {},
): Promise<string | null> {
  if (!aiEnabled) return null;
  const data = await callAnthropic({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages,
  }, feature);
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
  { maxTokens = 1024, model, feature }: CallOptions = {},
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
  }, feature);
  if (!data) return null;
  const textBlock = data.content?.find((b: any) => b.type === "text")?.text;
  return typeof textBlock === "string" ? textBlock : null;
}

// WHICH MODELS STILL ACCEPT A FORCED TOOL CALL.
//
// Every structured helper below asks for `tool_choice: {type: "tool"}` -- make
// this exact call, with these arguments -- because that is the only way to get
// reliable JSON out of a model rather than asking for JSON in prose and hoping
// it parses. From the Sonnet 5.5 / Opus 5.5 / Fable 5.1 generation that is a
// 400: `tool_choice: type "tool" and "any" are not supported for this model`.
// `{type: "auto"}` and `{type: "none"}` are unaffected.
//
// So the choice is per MODEL, not per call site, and the list is a DENY list
// on purpose. Guessing "forced" for an unknown model and being wrong is a 400:
// loud, immediate, and traceable to this line. Guessing "auto" and being wrong
// is silent -- the model is merely *asked* to call the tool, and on the fast
// lane it would also start emitting thinking blocks into a 200-token cap (see
// fastModel above). A loud failure beats a quiet one, so the default is forced
// and a model earns its way onto this list by actually rejecting it.
const FORCED_TOOL_CHOICE_REJECTED = [
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
  "claude-mythos-5-1",
];

export function acceptsForcedToolChoice(model: string): boolean {
  return !FORCED_TOOL_CHOICE_REJECTED.some((id) => model.startsWith(id));
}

/** Where forced tool use is rejected, `auto` is the replacement and the model
 * has to be TOLD which tool to use -- `auto` does not guarantee a call. This
 * appends that instruction to the last user turn, handling both message
 * shapes the helpers below build (a bare string, and a content array whose
 * last block is the text that follows an image or a document). */
function steerTowardTool(messages: any[], toolName: string, insist: boolean): any[] {
  const line = insist
    ? `\n\nYou did not call the \`${toolName}\` tool. You must call it now. Do not reply in prose.`
    : `\n\nUse the \`${toolName}\` tool to answer. Reply only by calling it.`;
  const out = messages.slice();
  const last = out[out.length - 1];
  if (!last || last.role !== "user") return out;
  if (typeof last.content === "string") {
    out[out.length - 1] = { ...last, content: last.content + line };
    return out;
  }
  if (Array.isArray(last.content)) {
    const blocks = last.content.slice();
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i]?.type === "text") {
        blocks[i] = { ...blocks[i], text: String(blocks[i].text ?? "") + line };
        out[out.length - 1] = { ...last, content: blocks };
        return out;
      }
    }
    blocks.push({ type: "text", text: line.trim() });
    out[out.length - 1] = { ...last, content: blocks };
  }
  return out;
}

/** The one place a tool call is asked for, so the forced/auto split above is
 * decided once rather than in each of the three helpers that wrap it.
 *
 * On the auto path a missing tool call is a real outcome, not an error: the
 * model answered in prose instead. That gets ONE sharper retry before giving
 * up, which is what the migration guidance asks for ("check that a call was
 * made and retry if it wasn't") and what keeps a feature from silently doing
 * nothing because the model felt chatty. Forced models skip the retry -- they
 * cannot not call it. */
async function callToolForResult<T>(
  base: { model: string; max_tokens: number; system: unknown; messages: any[] },
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  feature?: string,
): Promise<T | null> {
  const forced = acceptsForcedToolChoice(base.model);
  const attempts = forced ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const data = await callAnthropic(
      {
        ...base,
        messages: forced ? base.messages : steerTowardTool(base.messages, tool.name, attempt > 0),
        tools: [tool],
        tool_choice: forced ? { type: "tool", name: tool.name } : { type: "auto" },
      },
      feature,
    );
    if (!data) return null;
    const toolUse = data.content?.find((b: any) => b.type === "tool_use");
    if (toolUse) return (toolUse.input as T) ?? null;
    if (attempt + 1 < attempts) {
      console.warn(`Claude answered ${feature ?? "a structured call"} in prose instead of calling ${tool.name}; asking again`);
    }
  }
  return null;
}

/** Structured extraction via tool use -- the reliable way to get Claude to
 * return actual JSON matching a shape, rather than asking for JSON in prose
 * and hoping it parses. Returns null on no-config/failure/refusal.
 * Callers should still validate the result against a zod schema before
 * trusting it -- this only guarantees Claude called the tool, not that every
 * field is the type/shape the tool schema asked for. */
export async function askClaudeStructured<T>(
  system: SystemPrompt,
  userPrompt: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  { maxTokens = 1024, model, feature }: CallOptions = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  return callToolForResult<T>({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages: [{ role: "user", content: userPrompt }],
  }, tool, feature);
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
  { maxTokens = 1024, model, feature }: CallOptions = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  return callToolForResult<T>({
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
  }, tool, feature);
}

/** Structured extraction from an uploaded FILE -- a PDF or a photograph of one.
 *
 * askClaudeVisionStructured above only takes images, which covers a meal photo and not the
 * thing people actually upload when you ask them for a signed form. Half arrive as a phone
 * snap and half as a multi-page scan, and a PDF is a `document` content block rather than an
 * `image` one -- same position in the message, different shape, and no beta header either way.
 *
 * Both go BEFORE the text block, which is what the API asks for and also what reads correctly:
 * the instruction is about the thing above it.
 */
export async function askClaudeFileStructured<T>(
  system: SystemPrompt,
  text: string,
  file:
    | { kind: "pdf"; data: string }
    | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string },
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  { maxTokens = 1024, model, feature }: CallOptions = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  const fileBlock =
    file.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file.data },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: file.mediaType, data: file.data },
        };
  return callToolForResult<T>({
    model: model || defaultModel,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    messages: [{ role: "user", content: [fileBlock, { type: "text", text }] }],
  }, tool, feature);
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
    feature,
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
): Promise<{ toolName: string; input: T; text?: undefined } | { toolName: null; input?: undefined; text: string } | null> {
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
    }, feature);
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
    // The model answered in prose instead of calling a tool. That used to
    // return null, which forced any caller offering an OPTIONAL tool -- one
    // the model is free to ignore -- to throw the answer away and make a
    // second full request for the same thing. On the nutrition assistant,
    // the busiest AI surface in the app, that doubled the cost and the
    // latency of every ordinary question. The text was always right here.
    const textBlock = data.content?.find((b: any) => b.type === "text")?.text;
    if (typeof textBlock === "string" && textBlock.trim()) {
      return { toolName: null, text: textBlock.trim() };
    }
    return null;
  }
  return null;
}


/**
 * This file, viewed through the neutral seam.
 *
 * The seam existed as types nothing implemented, which made it decorative --
 * a boundary that has never had anything on both sides of it is a boundary
 * nobody has checked is possible to honour. Implementing it here proves the
 * shape actually fits the one provider in use, which is the only way to know
 * a second one could slot in.
 *
 * It deliberately does NOT become the path every call site takes. Rewriting
 * thirty-five call sites onto an interface with one implementation buys
 * nothing today and risks a regression in every AI feature at once. The
 * value is that the contract is now real and compiled; migrating callers is
 * a separate job, done when there is a second provider to migrate them for.
 */
export const anthropicProvider: AiProvider = {
  name: "anthropic",
  defaultModel,
  fastModel,
  supportsVision: true,

  async send(request: NeutralRequest): Promise<NeutralResponse | null> {
    const data = await callAnthropic(
      {
        model: request.model || defaultModel,
        max_tokens: request.maxTokens,
        system: buildSystemField(request.system),
        messages: request.messages.map((m) => ({
          role: m.role,
          content:
            m.images && m.images.length > 0
              ? [
                  ...m.images.map((img) => ({
                    type: "image",
                    source: { type: "base64", media_type: img.mediaType, data: img.data },
                  })),
                  ...(m.text ? [{ type: "text", text: m.text }] : []),
                ]
              : (m.text ?? ""),
        })),
        ...(request.tools ? { tools: request.tools, tool_choice: { type: "auto" } } : {}),
      },
      request.feature,
    );
    if (!data) return null;

    const toolUse = data.content?.find((b: any) => b.type === "tool_use");
    const textBlock = data.content?.find((b: any) => b.type === "text")?.text;
    const usage = data.usage ?? {};

    return {
      text: typeof textBlock === "string" ? textBlock : null,
      toolCall: toolUse ? { name: toolUse.name, input: toolUse.input } : null,
      usage: {
        inputTokens: Number(usage.input_tokens ?? 0),
        outputTokens: Number(usage.output_tokens ?? 0),
        cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0),
        cacheWriteTokens: Number(usage.cache_creation_input_tokens ?? 0),
      },
      model: String(data.model ?? request.model ?? defaultModel),
      // callAnthropic already discards a truncated response, so anything
      // reaching here is complete. Reported rather than assumed, because a
      // future provider implementation must not quietly drop the signal.
      truncated: data.stop_reason === "max_tokens",
    };
  },
};
