import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A PERMANENT REFUSAL IS NEVER DRAWN AS AN INVITATION, OR TOASTED AS "TRY AGAIN".
 *
 * Found 2026-10-24. `program-ai-chat-panel.tsx` handled exactly ONE status, 402, with a comment
 * stating the right principle in its own words -- "an expected, permanent state, not a transient
 * failure, so it gets its own quiet locked-state card instead of an error". Every other status
 * fell through to the normal render, where `messages` is undefined, so the EMPTY STATE drew:
 * "Tell me what you want to build ... I'll ask if I need anything else before building your
 * program." The athlete types, and `send`'s onError says "Couldn't send that, try again" -- a
 * transient sentence for a permanent condition, so they try again, and again.
 *
 * 404 IS REACHED WITHOUT ANYBODY DOING ANYTHING ODD. The athlete programs route deliberately
 * returns a Free Agent their own programs PLUS every Forge-official one, so a template opens in
 * the builder with this panel beside it -- while the panel's own route resolves through
 * `assertCoachOwnsProgram`, which a template fails: 404 "Program not found".
 *
 * The fix names the thing that DOES work rather than only refusing: Duplicate is drawn
 * unconditionally on the program list (unlike Edit, which sits behind `p.editable`) and titled
 * "Duplicate as a new editable program", and it POSTs a copy owned by the athlete that the AI can
 * edit. A refusal that names no alternative is the shape Rule #1 exists to refuse.
 */

const PANEL = join(process.cwd(), "client", "src", "components", "program-ai-chat-panel.tsx");

/** Comments first. DEFENSIVE IN EFFECT TODAY, and said so rather than implied: mutation-tested,
 *  removing this strip leaves all four cases green, because nothing currently in either file
 *  quotes a matched form (`error.status === 404`, the Duplicate sentence) inside a comment. It
 *  stays because the paragraphs above and in the panel are exactly where the old shape gets
 *  quoted next, and CLAUDE.md records that as the most repeated self-inflicted failure here. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const src = strip(readFileSync(PANEL, "utf8"));

describe("the AI program panel answers every permanent status", () => {
  /* Both statuses the panel's route can answer permanently. 402 is requirePaidAiAccess; 404 is
   * assertCoachOwnsProgram refusing a program the builder nonetheless shows. Stated as a LIST of
   * what must be HANDLED rather than a scan for what is missing, because the set is closed by the
   * route's own middleware and a new one should fail here deliberately. */
  const PERMANENT = [402, 404];

  it.each(PERMANENT)("status %i gets its own early return, not the inviting empty state", (status) => {
    expect(
      new RegExp(`error\\.status\\s*===\\s*${status}\\b`).test(src),
      `program-ai-chat-panel.tsx does not handle ${status}. An unhandled status falls through to ` +
        `the normal render, where \`messages\` is undefined and the empty state invites the ` +
        `athlete to describe a program -- on a panel whose every request will fail the same way. ` +
        `Give it a quiet card, as 402 has.`,
    ).toBe(true);
  });

  it("so send can never be reached in a state where retrying cannot help", () => {
    /* The other half, and the first draft of this case got it wrong in a way worth recording: it
     * asserted that a status was handled BEFORE `onError:` in SOURCE ORDER, which means nothing --
     * one is an early return in the render, the other a callback on a mutation, and their order in
     * the file decides neither.
     *
     * The property that does hold: each permanent status returns its card BEFORE the main render,
     * so the composer and its send button are never drawn in that state and `send`'s generic
     * "try again" toast can only ever describe a real transient. That is what makes keeping the
     * generic toast correct rather than lazy. */
    const mainReturn = src.lastIndexOf("return (");
    expect(mainReturn).toBeGreaterThan(-1);
    for (const status of PERMANENT) {
      const at = src.search(new RegExp(`error\\.status\\s*===\\s*${status}\\b`));
      expect(at).toBeGreaterThan(-1);
      expect(
        at < mainReturn,
        `the ${status} branch sits after the panel's main return, so the composer is drawn and ` +
          `send's "try again" toast is reachable for a refusal that can never succeed.`,
      ).toBe(true);
    }
    // And the composer really is in that main return, or the check above is about nothing.
    expect(src.slice(mainReturn)).toMatch(/send\s*\./);
  });

  it("the 404 card names what the athlete CAN do, rather than only refusing", () => {
    const at = src.indexOf("error.status === 404");
    expect(at).toBeGreaterThan(-1);
    // Bounded by the end of this early return, not a character window.
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(
      /[Dd]uplicate/.test(body),
      "the 404 card refuses without naming the Duplicate action, which is the one thing that " +
        "turns a Forge template into a program the AI can edit. A refusal with no alternative is " +
        "what Rule #1 is about.",
    ).toBe(true);
  });
});
