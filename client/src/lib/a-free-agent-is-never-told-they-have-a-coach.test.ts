import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* A FREE AGENT IS NEVER TOLD THEY HAVE A COACH, AND NEVER SHOWN A LIST THEY CANNOT REACH.
 *
 * Three findings of one family, 2026-10-24. The platform's "does this athlete have a coach"
 * answer arrives over the network, so every surface that branches on it has a third state, and
 * `useIsFreeAgent`'s own doc names it: "`undefined` while the answer isn't known yet -- callers
 * should treat that as 'not yet', not as 'no'".
 *
 * 1. `athlete/progress.tsx` collapsed the tri-state with `=== true` and then read the boolean in
 *    BOTH polarities. `=== true` is right for the `isFreeAgent` reads and inverted for the
 *    `!isFreeAgent` ones: while the answer was unknown `!isFreeAgent` was TRUE, so a Free Agent
 *    was shown "Coach reviews" and "Ask your coach to check a lift" until the request landed --
 *    the cards this repo deleted in 2026-09-22 because they "described something that could not
 *    happen", back for the length of one fetch.
 *
 * 2. `athlete/classes.tsx` guarded its empty state on `coachesFailed` and not `coachesLoading`,
 *    though `coachesLoading` was already destructured and already guards the catalog further down
 *    the same file. All four queries fire in parallel on mount, so whenever my-classes resolved
 *    first a Free Agent read "Your coach hasn't enrolled you in a Class yet."
 *
 * 3. And the one that is not a flicker: `mode="self"` -- the ONLY surface in the client that
 *    lists an athlete's own video reviews -- sat inside `!isFreeAgent`, while the Video workbench
 *    that CREATES them is shown only to a Free Agent. `VideoWorkbenchCard` passes
 *    `subject={{ kind: "self" }}`, video-compare's "Save as review" renders for every subject but
 *    a guardian, and for a self subject it POSTs to `/api/athlete/self-reviews`, which is
 *    `requireRole("athlete")` with no requireFreeAgent. So the save succeeded and the row was
 *    unreachable the moment the dialog closed -- the exact inverse of the bug video-compare's own
 *    comment records fixing ("both saved-review lists promised something no button could
 *    produce"), and invisible, because a persisted row and a row that never saved look identical
 *    from the screen.
 *
 * Stated as what is FORBIDDEN, and discovered from the client directory rather than from a list
 * of the three files, so the fourth surface to branch on this fails here the day it is written.
 */

const PAGES = join(process.cwd(), "client", "src", "pages");
const COMPONENTS = join(process.cwd(), "client", "src", "components");

/** Comments first, always. The paragraphs above and in all three fixed files quote the old
 *  forms -- `!isFreeAgent`, `mode="self"`, `=== true` -- and prose about what the code no longer
 *  does is indistinguishable from the code still doing it. CLAUDE.md calls this the most repeated
 *  self-inflicted failure in this repo. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const clientFiles = [...walk(PAGES), ...walk(COMPONENTS)].filter(
  (f) => !/\.test\.tsx?$/.test(f),
);

/** Every `{<expr> && (` block in the source, as {guard, body}, bodies bounded by MATCHING THE
 *  BLOCK'S OWN PARENS. Never a character window: CLAUDE.md records two tests broken by fixed
 *  slices, including the half that is worse than a false red -- a window also PASSES for a match
 *  that sits inside it and belongs to something else entirely. */
function guardedBlocks(src: string): { guard: string; body: string }[] {
  const out: { guard: string; body: string }[] = [];
  for (const m of src.matchAll(/\{\s*([^{}()]*?)&&\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) {
        out.push({ guard: m[1].trim(), body: src.slice(open, i + 1) });
        break;
      }
    }
  }
  return out;
}

describe("the surface that lists a thing is reachable by whoever can create it", () => {
  const selfListFiles = clientFiles.filter((f) => /mode="self"/.test(strip(readFileSync(f, "utf8"))));

  it('finds the mode="self" list at all', () => {
    // A floor: if this stops matching, the rule below passes for nothing.
    expect(
      selfListFiles.length,
      'no client file renders VideoReviewList mode="self" any more. If self-reviews were removed, ' +
        "delete this block; if it was renamed, this scan has gone blind.",
    ).toBeGreaterThanOrEqual(1);
  });

  it.each(selfListFiles.map((f) => [f.split("/").slice(-2).join("/"), f]))(
    "%s does not hide the self-review list behind having a coach",
    (_label, file) => {
      const src = strip(readFileSync(file, "utf8"));
      const hiding = guardedBlocks(src).filter(
        (b) => /mode="self"/.test(b.body) && /!\s*isFreeAgent|hasCoach|coaches\?*\.length\s*>/.test(b.guard),
      );
      expect(
        hiding.map((b) => b.guard),
        'the only client surface that lists an athlete\'s own video reviews is gated on having a ' +
          "coach, while the Video workbench that creates them is shown only to a Free Agent. A " +
          "Free Agent can save a self-review (video-compare POSTs /api/athlete/self-reviews for a " +
          "self subject, and that route has no requireFreeAgent) and would never see it again.",
      ).toEqual([]);
    },
  );
});

describe("nothing about a coach is drawn before the answer arrives", () => {
  it("athlete/progress.tsx gates every coach-only block on the answer being KNOWN", () => {
    /* The tri-state rule, asserted as what is forbidden: a coach-only block may not be guarded
     * on a bare `!isFreeAgent`, because that is TRUE while the answer is unknown. */
    const src = strip(readFileSync(join(PAGES, "athlete", "progress.tsx"), "utf8"));
    const bare = guardedBlocks(src).filter((b) => /^!\s*isFreeAgent$/.test(b.guard));
    expect(
      bare.length,
      "a block in athlete/progress.tsx is guarded on a bare `!isFreeAgent`. useIsFreeAgent is " +
        "tri-state and `=== true` makes `!isFreeAgent` true while the answer is still in flight, " +
        "so a Free Agent sees the coach cards until /api/athlete/coaches lands. Use the name that " +
        "requires an answer (hasCoach), not the negation of the one that does not.",
    ).toBe(0);
    // And the positive half: the answer-aware name exists and is what the blocks use.
    expect(src).toMatch(/const\s+hasCoach\s*=/);
    expect(src).toMatch(/\{\s*hasCoach\s*&&/);
  });

  it("athlete/classes.tsx will not choose between the two sentences while the read is in flight", () => {
    /* Bounded by the guard's own parens, so the assertion is about THIS card and not about the
     * file containing the word somewhere. */
    const src = strip(readFileSync(join(PAGES, "athlete", "classes.tsx"), "utf8"));
    const sentence = "hasn't enrolled you";
    const blocks = guardedBlocks(src).filter((b) => b.body.includes(sentence));
    expect(
      blocks.length,
      `no block in athlete/classes.tsx renders "${sentence}" -- either the copy changed (update ` +
        "this test) or the guard scan has gone blind.",
    ).toBeGreaterThanOrEqual(1);
    for (const b of blocks) {
      expect(
        /coachesLoading/.test(b.guard),
        "the card that chooses between \"browse Forge Classes\" and \"Your coach hasn't enrolled " +
          "you\" is not guarded on coachesLoading. isFreeAgent is `!!coaches && ...`, so an " +
          "unresolved read means 'has a coach', and this page fires all four queries in parallel " +
          "-- whenever my-classes wins the race a Free Agent is told they have a coach. " +
          `Guard: {${b.guard}}`,
      ).toBe(true);
    }
  });

  it("and the Send-to-coach button is not drawn for somebody with nobody to send to", () => {
    const list = strip(readFileSync(join(COMPONENTS, "video-review-list.tsx"), "utf8"));
    const editor = strip(readFileSync(join(COMPONENTS, "video-review-editor.tsx"), "utf8"));
    // Threaded, not re-derived: the list cannot know about coaches, so the decision comes from
    // the page that does.
    expect(list).toMatch(/canSend/);
    expect(editor).toMatch(/canSend/);
    // The button itself must sit behind it.
    const guarded = guardedBlocks(editor).filter((b) => /Send to coach/.test(b.body));
    expect(
      guarded.some((b) => /canSend/.test(b.guard)),
      'the "Send to coach" button in the review editor is not behind canSend, so an athlete with ' +
        "no coach is offered it -- the same shape as the three cards removed from " +
        "/athlete/progress in 2026-09-22.",
    ).toBe(true);
  });
});
