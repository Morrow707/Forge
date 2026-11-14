// THE AI PROGRAM BUILDER COULD NOT FINISH A 4-DAY PROGRAM (2026-11-14).
//
// Free Agent, one sentence: "Build me a 4-day program to get faster and more explosive for
// basketball." Four real requests against production, three answered "Sorry, I couldn't come up
// with a response" -- the Render log read "Claude request truncated at max_tokens" on each, at
// 8192 tokens after 71-95s. A whole program is one tool call and callAnthropic discards a
// truncated one whole, so the cap decided whether the headline Free Agent feature worked.
//
// Three things had to move together, and each is pinned here:
//   1. the cap (16000, one named constant read by both builders);
//   2. the request timeout, which was a flat 120s -- 16000 tokens at the measured ~11ms a token
//      is ~180s, so the cap alone would have turned a truncation into a timeout;
//   3. the panel's automatic retries, which re-sent the same turn into a server that was still
//      writing it: three copies of the athlete's message and three paid model calls.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { requestTimeoutMs } from "./ai";
import { PROGRAM_CHAT_MAX_TOKENS } from "./program-chat-limits";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

// Drops whole-line `//` comments and JSX `{/* */}` blocks, so prose quoting a forbidden form
// cannot satisfy or fail a scan. Matches "  // retry: 2" and "{/* retry: 2 */}"; leaves
// "retry: false, // note" alone. https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F
const WHOLE_LINE_COMMENT = /^\s*\/\//;
// A JSX comment block: matches "{/* retry: 2 */}"; rejects "{retry}" and "/* a */".
// https://regex101.com/?regex=%5C%7B%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F%5C%7D
const JSX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => (WHOLE_LINE_COMMENT.test(line) ? "" : line))
    .join("\n")
    .replace(JSX_COMMENT, "");
}

// The cap the truncated production turns ran into.
const OLD_CAP_TOKENS = 8192;
// The slowest of those turns: 8192 tokens in 95s.
const SLOWEST_TRUNCATED_TURN_MS = 95_000;
const MEASURED_MS_PER_TOKEN = SLOWEST_TRUNCATED_TURN_MS / OLD_CAP_TOKENS;
const TIMEOUT_FLOOR_MS = 120_000;
const TIMEOUT_CEILING_MS = 300_000;
const A_SMALL_CALL_TOKENS = 500;
const AN_ABSURD_CALL_TOKENS = 1_000_000;
const BUILDER_FEATURES = ["program-chat", "skill-program-chat"];

describe("the AI program builder can finish a program", () => {
  it("allows more output than the 4-day program that was truncated at 8192", () => {
    expect(PROGRAM_CHAT_MAX_TOKENS).toBeGreaterThan(OLD_CAP_TOKENS);
  });

  it("both builders (strength and skills) read the one cap", () => {
    const src = stripComments(read("server/storage.ts"));
    const calls = BUILDER_FEATURES.map((feature) => {
      const at = src.indexOf(`feature: "${feature}"`);
      return { feature, at, call: at < 0 ? "" : src.slice(at, src.indexOf("})", at)) };
    });
    calls.forEach(({ feature, at, call }) => {
      expect(at, feature).toBeGreaterThan(-1);
      expect(call, feature).toContain("maxTokens: PROGRAM_CHAT_MAX_TOKENS");
    });
  });

  it("waits long enough for the cap it allows, at the rate production measured", () => {
    expect(requestTimeoutMs(PROGRAM_CHAT_MAX_TOKENS)).toBeGreaterThan(
      PROGRAM_CHAT_MAX_TOKENS * MEASURED_MS_PER_TOKEN,
    );
  });

  it("keeps the old two-minute bound for small calls and a ceiling for huge ones", () => {
    expect(requestTimeoutMs(undefined)).toBe(TIMEOUT_FLOOR_MS);
    expect(requestTimeoutMs(A_SMALL_CALL_TOKENS)).toBe(TIMEOUT_FLOOR_MS);
    expect(requestTimeoutMs(AN_ABSURD_CALL_TOKENS)).toBe(TIMEOUT_CEILING_MS);
  });

  it("does not resend a timed-out model call (minutes of waiting is not a blip)", () => {
    expect(stripComments(read("server/ai.ts"))).toContain("attempt === 0 && !timedOut");
  });

  it("the panel never re-sends a turn on its own, and waits for a slow reply", () => {
    const src = stripComments(read("client/src/components/program-ai-chat-panel.tsx"));
    expect(src).toContain("retry: false");
    expect(src).not.toContain("retry: 2");
    expect(src).not.toContain("retryDelay");
    // A non-4xx failure starts the wait rather than a "try again" toast, and the wait reads the
    // conversation until the reply is in it.
    expect(src).toContain("setAwaitingSince(sendStartedRef.current");
    expect(src).toContain("refetchInterval: awaitingSince != null");
  });
});
