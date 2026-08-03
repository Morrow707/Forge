const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Every AI feature in the app is a no-op until ANTHROPIC_API_KEY is set --
// same graceful-degrade pattern as Resend (email.ts) and VAPID (push.ts).
// Nothing here ever blocks a request or crashes the server on failure; a
// missing/failed AI call just means that feature quietly has nothing to show.
export const aiEnabled = Boolean(apiKey);
if (!aiEnabled) {
  console.warn("AI coach disabled: ANTHROPIC_API_KEY not set.");
}

/** Plain-text completion -- digests, chat replies, anything meant to be read
 * as prose rather than parsed as data. Returns null if AI isn't configured
 * or the request fails; callers should treat that the same as "no insight
 * available yet," never surface it as an error to the user. */
export async function askClaude(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  { maxTokens = 1024 }: { maxTokens?: number } = {},
): Promise<string | null> {
  if (!aiEnabled) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
    if (!res.ok) {
      console.error("Claude request failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data.content?.find((b: any) => b.type === "text")?.text;
    return typeof text === "string" ? text : null;
  } catch (err: any) {
    console.error("Claude request failed:", err?.message || err);
    return null;
  }
}

/** Structured extraction via forced tool use -- the reliable way to get
 * Claude to return actual JSON matching a shape, rather than asking for JSON
 * in prose and hoping it parses. Returns null on no-config/failure/refusal. */
export async function askClaudeStructured<T>(
  system: string,
  userPrompt: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  { maxTokens = 1024 }: { maxTokens?: number } = {},
): Promise<T | null> {
  if (!aiEnabled) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
      }),
    });
    if (!res.ok) {
      console.error("Claude structured request failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const toolUse = data.content?.find((b: any) => b.type === "tool_use");
    return (toolUse?.input as T) ?? null;
  } catch (err: any) {
    console.error("Claude structured request failed:", err?.message || err);
    return null;
  }
}
