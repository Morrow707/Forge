import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * FORCED TOOL USE IS REJECTED FROM THE SONNET 5.5 GENERATION, AND THAT IS THE
 * WHOLE RISK IN THE 2026-10-08 DEFAULT-MODEL UPGRADE.
 *
 * `tool_choice: {type: "tool", name}` -- make this exact call -- is how every
 * structured feature in Forge gets reliable JSON. Sonnet 5.5, Opus 5.5, Fable
 * 5.1 and Mythos 5.1 answer it with a 400. The replacement is `auto` plus an
 * instruction naming the tool, and because `auto` does not guarantee a call,
 * a check that one happened and one retry when it did not.
 *
 * Two things this file is really protecting, both of which fail QUIETLY if the
 * split is got wrong in either direction:
 *
 *  - Flip a model that ACCEPTS forced onto `auto` and the fast lane starts
 *    emitting thinking blocks into a 200-token cap (see fastModel in ai.ts),
 *    which callAnthropic then discards as a max_tokens truncation. The feature
 *    returns null and nobody is told.
 *  - Flip a model that REJECTS forced onto forced and every structured call in
 *    the app 400s at once.
 *
 * The prefix test matters more than it looks: "claude-sonnet-5" must NOT match
 * the "claude-sonnet-5-5" entry. Getting that backwards would silently move
 * the ENTIRE app onto the auto path while still running the old model.
 */

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_MODEL = process.env.ANTHROPIC_MODEL;

async function loadAi() {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "test-key";
  return import("./ai");
}

/** Captures every request body callAnthropic sends, and replies with the
 *  queued responses in order. */
function stubFetch(responses: unknown[]) {
  const sent: any[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body));
      const body = responses[Math.min(i++, responses.length - 1)];
      return { ok: true, json: async () => body } as any;
    }),
  );
  return sent;
}

const TOOL = {
  name: "emit_result",
  description: "Emit the structured result.",
  input_schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
};

const toolUseReply = { stop_reason: "tool_use", content: [{ type: "tool_use", name: "emit_result", input: { value: "ok" } }], usage: {} };
const proseReply = { stop_reason: "end_turn", content: [{ type: "text", text: "Sure, here is the answer in prose." }], usage: {} };

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODEL === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = ORIGINAL_MODEL;
});

describe("which models still accept a forced tool call", () => {
  it("names exactly the generation that rejects it, and nothing older", async () => {
    const { acceptsForcedToolChoice } = await loadAi();
    for (const rejects of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"]) {
      expect(acceptsForcedToolChoice(rejects), `${rejects} should reject forced tool use`).toBe(false);
    }
    // THE PREFIX TRAP. claude-sonnet-5 is NOT claude-sonnet-5-5; matching it
    // would move every structured call in the app onto the auto path while
    // still running the old model, and nothing would error.
    for (const accepts of ["claude-sonnet-5", "claude-opus-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001"]) {
      expect(acceptsForcedToolChoice(accepts), `${accepts} should still accept forced tool use`).toBe(true);
    }
  });

  it("defaults an unknown model to forced, because that failure is loud", async () => {
    const { acceptsForcedToolChoice } = await loadAi();
    expect(acceptsForcedToolChoice("claude-something-unreleased")).toBe(true);
  });
});

describe("the structured helpers pick the right tool_choice", () => {
  beforeEach(() => vi.resetModules());

  it("forces the call on a model that accepts it, and does not nag the prompt", async () => {
    const sent = stubFetch([toolUseReply]);
    const { askClaudeStructured } = await loadAi();
    const out = await askClaudeStructured("sys", "do the thing", TOOL, { model: "claude-haiku-5-5" });
    expect(out).toEqual({ value: "ok" });
    expect(sent).toHaveLength(1);
    expect(sent[0].tool_choice).toEqual({ type: "tool", name: "emit_result" });
    // A forced call needs no steering, and adding it would burn input tokens
    // on every call on the highest-volume lane in the app.
    expect(sent[0].messages[0].content).toBe("do the thing");
  });

  it("asks with auto AND names the tool on a model that rejects forced", async () => {
    const sent = stubFetch([toolUseReply]);
    const { askClaudeStructured } = await loadAi();
    const out = await askClaudeStructured("sys", "do the thing", TOOL, { model: "claude-sonnet-5-5" });
    expect(out).toEqual({ value: "ok" });
    expect(sent[0].tool_choice).toEqual({ type: "auto" });
    expect(sent[0].messages[0].content).toContain("do the thing");
    expect(sent[0].messages[0].content).toContain("emit_result");
  });

  it("retries once when auto answered in prose, then gives up rather than inventing a result", async () => {
    const sent = stubFetch([proseReply, proseReply]);
    const { askClaudeStructured } = await loadAi();
    const out = await askClaudeStructured("sys", "do the thing", TOOL, { model: "claude-sonnet-5-5" });
    // Null, never a fabricated shape -- every caller already treats null as
    // "no insight available" and validates with zod before trusting a result.
    expect(out).toBeNull();
    expect(sent).toHaveLength(2);
    expect(sent[1].messages[0].content).toContain("must call it now");
  });

  it("takes the result when the retry lands", async () => {
    const sent = stubFetch([proseReply, toolUseReply]);
    const { askClaudeStructured } = await loadAi();
    expect(await askClaudeStructured("sys", "x", TOOL, { model: "claude-sonnet-5-5" })).toEqual({ value: "ok" });
    expect(sent).toHaveLength(2);
  });

  it("never retries a forced model -- it cannot decline to call the tool", async () => {
    const sent = stubFetch([proseReply]);
    const { askClaudeStructured } = await loadAi();
    expect(await askClaudeStructured("sys", "x", TOOL, { model: "claude-haiku-5-5" })).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("steers the text block, not the image, on the vision and file helpers", async () => {
    const sent = stubFetch([toolUseReply]);
    const { askClaudeVisionStructured } = await loadAi();
    await askClaudeVisionStructured(
      "sys", "describe it",
      [{ mediaType: "image/jpeg", data: "AAAA" }],
      TOOL, { model: "claude-sonnet-5-5" },
    );
    const content = sent[0].messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.data).toBe("AAAA");
    const text = content.find((b: any) => b.type === "text");
    expect(text.text).toContain("describe it");
    expect(text.text).toContain("emit_result");
  });
});

describe("a safety decline is reported as one", () => {
  it("returns null on stop_reason refusal rather than letting it read as an empty answer", async () => {
    stubFetch([{ stop_reason: "refusal", stop_details: { category: "cyber", explanation: "no" }, content: [], usage: {} }]);
    const { askClaude } = await loadAi();
    expect(await askClaude("sys", [{ role: "user", content: "x" }], { model: "claude-sonnet-5-5" })).toBeNull();
  });
});
