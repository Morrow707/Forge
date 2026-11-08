import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ANVIL_FORBIDDEN_TERMS,
  ANVIL_FORBIDDEN_TERM_WORDS,
  ANVIL_PERMITTED_TERMS,
  isAnvilSurface,
  serverFileIsAnvilOutput,
} from "./anvil-vocabulary";

/**
 * THE RATCHET FOR `shared/anvil-vocabulary.ts`, AND IT POLICES AN EMPTY SET TODAY, WHICH IS WHY
 * HALF THE CASES DRIVE SYNTHETIC INPUT INSTEAD OF THE DIRECTORY.
 *
 * There is no Anvil surface in the client. A scan over zero files passes for the same reason a
 * broken scan passes -- "a correct empty state and a broken gate are the same pixels", which this
 * repo has now paid for in the npm-audit gate and in two camera ratchets. So the discovery
 * predicate is driven directly on constructed files, and the directory sweep is the part that
 * starts working the day somebody commits the first screen.
 *
 * THE SCOPE IS ASSERTED IN BOTH DIRECTIONS AND THAT IS THE LOAD-BEARING HALF. Three of the
 * forbidden words name features Forge already ships. Widening this scan platform-wide would
 * require renaming the readiness banner, the recovery page and the coach analytics surface across
 * 33+ files, for a product with no users. A case below fails if those files ever come into scope,
 * so the widening cannot arrive as somebody's tidy-up -- it has to arrive as a decision.
 */

const CLIENT_SRC = join(import.meta.dirname ?? __dirname, "..", "client", "src");

/**
 * LINE-AWARE COMMENT STRIP, duplicated from `the-anvil-reads-everything-forge-collects.test.ts`
 * rather than shared, as `functionBodyAt` is in four files here. The two-regex version this repo
 * recommends for short files destroys long ones: a non-greedy block-comment regex pairs an opener
 * inside a string with the next real closer thousands of lines away, measured at 413,000 of
 * 734,000 characters of `routes.ts` deleted silently. A block comment counts only when its opener
 * starts its line; an end-of-line comment is cut only where the quotes before `//` are balanced.
 */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      out.push("");
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      out.push("");
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let dq = 0;
    let sq = 0;
    let bt = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') dq ^= 1;
      else if (c === "'") sq ^= 1;
      else if (c === "`") bt ^= 1;
      else if (c === "/" && line[i + 1] === "/" && !dq && !sq && !bt) {
        cut = i;
        break;
      }
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

/**
 * THE SERVER HALF OF THE SCOPE, AND IT IS HERE BECAUSE A PDF IS A SURFACE.
 *
 * The scan was client-only when it was written, which was correct while the only Anvil output
 * was a screen. `server/anvil-report.ts` prints a coach's weekly page, and a printed sentence is
 * read by a person exactly as a rendered one is -- and outlives it. A scan that could not see a
 * file because it sits in a different directory is this repo's most repeated self-inflicted
 * failure (the upload-directory list, the `/email.*\.ts$/` glob, `parental_notice`), so the
 * sweep below takes the UNION and `isAnvilSurface` still decides membership.
 */
function serverFiles(): Array<{ path: string; source: string }> {
  const root = join(import.meta.dirname, "..", "server");
  return readdirSync(root)
    .filter((e) => /\.tsx?$/.test(e) && !/\.(test|itest)\.tsx?$/.test(e))
    .map((e) => ({ path: `server/${e}`, source: readFileSync(join(root, e), "utf8") }))
    .filter((f) => serverFileIsAnvilOutput(f.path));
}

function clientFiles(): Array<{ path: string; source: string }> {
  const found: Array<{ path: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      found.push({
        path: relative(CLIENT_SRC, full).replace(/\\/g, "/"),
        source: readFileSync(full, "utf8"),
      });
    }
  };
  walk(CLIENT_SRC);
  return found;
}

describe("the Anvil's vocabulary is a decision, written down before the first screen", () => {
  it("states a reason for every forbidden term", () => {
    expect(ANVIL_FORBIDDEN_TERMS.length).toBeGreaterThan(0);
    for (const { term, why } of ANVIL_FORBIDDEN_TERMS) {
      expect(term.trim(), "a forbidden term must not be blank").not.toBe("");
      expect(
        why.length,
        `"${term}" carries no reason. A banned word with no reason is the one somebody deletes ` +
          "without knowing what they are trading.",
      ).toBeGreaterThan(40);
    }
  });

  it("keeps the permitted and forbidden lists disjoint", () => {
    for (const permitted of ANVIL_PERMITTED_TERMS) {
      expect(
        ANVIL_FORBIDDEN_TERM_WORDS,
        `"${permitted}" is on both lists, which decides nothing.`,
      ).not.toContain(permitted.toLowerCase());
    }
  });

  it("forbids the two spellings of the name Scott dropped on 2026-11-06", () => {
    expect(ANVIL_FORBIDDEN_TERM_WORDS).toContain("neuro-fatigue");
    expect(ANVIL_FORBIDDEN_TERM_WORDS).toContain("neural fatigue");
  });

  it("permits the one term that is literally what is measured", () => {
    expect(ANVIL_PERMITTED_TERMS).toContain("reaction time");
  });
});

describe("what counts as an Anvil surface is discovered from what a file does", () => {
  it("finds a surface by its path", () => {
    expect(isAnvilSurface("pages/anvil/check.tsx", "export default function Check() {}")).toBe(true);
    expect(isAnvilSurface("components/anvil-daily-card.tsx", "export function Card() {}")).toBe(
      true,
    );
  });

  it("finds a surface that reads the Anvil's data under any other name", () => {
    // THE HALF THAT MATTERS. A screen called something else still reads the reading, and a rule
    // keyed on filenames alone would miss it -- the assertion direction this repo keeps relearning.
    const src = 'import { assembleAnvilState } from "shared/anvil-athlete-state";\n';
    expect(isAnvilSurface("pages/athlete/daily-check.tsx", src)).toBe(true);
    expect(isAnvilSurface("components/morning-card.tsx", 'import x from "@/shared/anvil-inputs";')).toBe(
      true,
    );
  });

  it("does not claim an ordinary file", () => {
    expect(isAnvilSurface("pages/workout.tsx", "const anvil = 1; // unrelated local")).toBe(false);
    expect(isAnvilSurface("lib/video-watermark.ts", "// flame+barbell+anvil glyph")).toBe(false);
  });

  it("refuses a forbidden term on a constructed Anvil surface, comments stripped", () => {
    const screen =
      'import { assembleAnvilState } from "shared/anvil-athlete-state";\n' +
      'export const label = "Your readiness today";\n';
    expect(isAnvilSurface("pages/anvil/view.tsx", screen)).toBe(true);
    const hits = ANVIL_FORBIDDEN_TERM_WORDS.filter((w) =>
      stripComments(screen).toLowerCase().includes(w),
    );
    expect(hits).toContain("readiness");
  });

  it("does not let a comment quoting a forbidden term fail an otherwise clean surface", () => {
    // The comment strip is LOAD-BEARING here and is proven rather than assumed: the paragraph a
    // developer writes to explain WHY the word is banned contains the word.
    const screen =
      'import { readAnvilSignal } from "shared/anvil-inputs";\n' +
      "// Deliberately not called readiness or recovery: see shared/anvil-vocabulary.ts\n" +
      'export const label = "Reaction time";\n';
    const hits = ANVIL_FORBIDDEN_TERM_WORDS.filter((w) =>
      stripComments(screen).toLowerCase().includes(w),
    );
    expect(hits, "a comment explaining the ban must not trip the ban").toEqual([]);
    const unstripped = ANVIL_FORBIDDEN_TERM_WORDS.filter((w) => screen.toLowerCase().includes(w));
    expect(
      unstripped.length,
      "if this is 0 the strip is doing nothing and this case proves nothing",
    ).toBeGreaterThan(0);
  });
});

describe("the scan's scope is narrow, in both directions", () => {
  it("every real Anvil surface uses only permitted words", () => {
    const surfaces = [
      ...clientFiles().filter((f) => isAnvilSurface(f.path, f.source)),
      ...serverFiles(),
    ];
    const offences: string[] = [];
    for (const { path, source } of surfaces) {
      const body = stripComments(source).toLowerCase();
      for (const word of ANVIL_FORBIDDEN_TERM_WORDS) {
        if (body.includes(word)) offences.push(`${path}: "${word}"`);
      }
    }
    expect(
      offences,
      "An Anvil surface may describe the number only in the permitted vocabulary. " +
        "shared/anvil-vocabulary.ts carries the reason for each refusal, and question 24 in " +
        "docs/legal-open-questions.md is where the list itself gets settled.",
    ).toEqual([]);
    // NOT VACUOUS ANY MORE, and the number is asserted so it cannot quietly become one again:
    // a refactor that moved every Anvil file out of the scan's reach would leave the case above
    // green with nothing in it. The first surface landed 2026-11-08.
    expect(
      surfaces.length,
      "no Anvil surface is in scope, so the sweep above proves nothing. Either isAnvilSurface " +
        "stopped recognising them or the files moved out of both walks.",
    ).toBeGreaterThan(0);
    expect(surfaces.map((s) => s.path)).toContain("server/anvil-report.ts");
  });

  it("leaves routes.ts and storage.ts out of the server scope, by path and not by import", () => {
    // THE CASE THAT KEEPS THE SERVER SWEEP HONEST. Both files import Anvil modules, so the
    // client predicate's second clause admits them -- and both hold "readiness" and "recovery"
    // (shipped features) plus "concussion" and "diagnos" (the consent and compliance text that
    // exists to refuse those claims). Scanning them would turn this ratchet into a demand to
    // rename live features and to delete the sentences that say what the Anvil is not.
    const routes = readFileSync(join(import.meta.dirname, "..", "server", "routes.ts"), "utf8");
    expect(
      isAnvilSurface("server/routes.ts", routes),
      "the client predicate still admits routes.ts by its import; if this flips, the server " +
        "sweep below is resting on something that changed",
    ).toBe(true);
    expect(serverFileIsAnvilOutput("server/routes.ts")).toBe(false);
    expect(serverFileIsAnvilOutput("server/storage.ts")).toBe(false);
    expect(serverFileIsAnvilOutput("server/anvil-report.ts")).toBe(true);
  });

  it("leaves the shipped readiness, recovery and fatigue surfaces out of scope", () => {
    // THE CASE THAT PROTECTS 33 FILES. "readiness" is in 15 user-visible client files, "recovery"
    // in 18, "fatigue" in 3, and three shipped features are NAMED for those words. Widening this
    // scan platform-wide is a rename of all of them for a product with no users; it may be the
    // right call once counsel answers question 24, and it is not a tidy-up.
    const shipped = [
      "components/readiness-banner.tsx",
      "pages/athlete/recovery.tsx",
      "pages/coach/analytics.tsx",
    ];
    const files = clientFiles();
    for (const path of shipped) {
      const file = files.find((f) => f.path === path);
      expect(file, `${path} has moved; update this case deliberately`).toBeDefined();
      expect(
        isAnvilSurface(file!.path, file!.source),
        `${path} is a shipped feature, not an Anvil surface. If this scan has been widened, that ` +
          "is a decision about renaming three live features and belongs in a commit that says so.",
      ).toBe(false);
    }
  });
});
