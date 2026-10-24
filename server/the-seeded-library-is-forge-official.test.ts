import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* THE BACKFILL CANNOT REACH A LIBRARY THAT DOES NOT EXIST YET, AND FOR A MONTH NOTHING ELSE DID.
 *
 * Found 2026-10-24. `exercises.is_forge_official` gates all three strength-profile queries
 * (storage.ts, `AND e.is_forge_official = true`), and its only writer was a one-shot in
 * reconcile-schema.ts guarded by the `applied_backfills` key
 * `forge_official_exercises_2026_09_21`. render.yaml's build command is
 * `db:reconcile && db:seed && db:reconcile`, so on a database created FRESH that one-shot runs
 * against an EMPTY exercises table, writes its marker anyway, and the second reconcile skips --
 * leaving every one of the 410 exercises the seed then creates false, permanently.
 *
 * MEASURED on a throwaway database brought up exactly as render.yaml does: 410 exercises, all
 * owned by the role-admin library owner, 0 flagged -- while 9 of 9 seeded classes ARE flagged by
 * the same run, because createClassWithStructure takes the flag as an argument. Deleting the
 * marker and re-reconciling flagged all 410, which is the proof that ORDERING was the whole
 * fault and the backfill itself is sound.
 *
 * PRODUCTION WAS NEVER AFFECTED and the distinction is the whole severity question: the
 * ownership handover to the admin has run in this seed since 2026-08-01 (`bef1f04f`), so when
 * the backfill landed on 2026-09-21 it saw an admin-owned library and flagged it, and no new
 * exercise NAME has entered seed.ts since. What was broken is every OTHER environment -- a dev
 * box, a new Render service, a rebuild after a database loss, and the integration harness, which
 * creates its database fresh on every CI run.
 *
 * WHY NO TEST COULD SEE IT. `strength-profile.itest.ts:65` sets the flag BY HAND on its own
 * fixture exercise, so the suite proves the QUERY works and is structurally blind to whether
 * anything in the real library is ever flagged -- the assertion-direction defect CLAUDE.md names
 * over and over. And the symptom on a broken environment is a percentile that matches zero rows
 * for everybody, which renders as "Not enough athletes on Forge yet": indistinguishable from the
 * real thin-cohort state the platform launched in (NORM_MIN_COHORT is 30 per group).
 *
 * So this file states what is FORBIDDEN -- the seed may not create library exercises that
 * nothing flags -- and DISCOVERS the lists from the source rather than holding any of its own, so
 * a fourth list added below fails here the day it is written. The proof that the write behaves
 * (by name, by owner, idempotent, and never touching an admin's own exercise) is on real
 * Postgres in `the-seeded-library-is-forge-official.itest.ts`.
 */

const SEED = readFileSync(join(process.cwd(), "server", "seed.ts"), "utf8");
const STORAGE = readFileSync(join(process.cwd(), "server", "storage.ts"), "utf8");

/** Prose about what the code does is indistinguishable from the code doing it, and the comment
 *  block above every fix is exactly where the old form gets quoted -- CLAUDE.md records this as
 *  the most repeated self-inflicted failure in this repo. Every scan below runs on stripped
 *  source, including the positive ones, since the comment that explains this fix names both
 *  `createExercise` and all three list identifiers. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** The body of the block opened by the `{` at or after `from`, by MATCHING ITS OWN BRACES.
 *  Never a character window: CLAUDE.md records `stripe-checkout.test.ts`'s fixed 220-character
 *  slice and `coach-profile-response.test.ts`'s 2000, including the half that is worse than a
 *  false red -- a window also PASSES for a match that sits inside it but belongs to an unrelated
 *  block further down the file. */
function blockFrom(src: string, from: number): string {
  /* The block must START here, bar whitespace. Without that test a BRACE-LESS body
   * (`for (const ex of allExercises) exerciseMap[ex.name] = ex.id;`, seed.ts:343) sends
   * indexOf hunting for the next `{` anywhere in the file and returns an unrelated block
   * hundreds of lines down -- which is the character-window bug wearing a brace matcher's
   * clothes, and it made the first draft of this file report `allExercises` as a list of
   * library exercises. A single-statement body is returned as itself. */
  const rest = src.slice(from);
  const lead = rest.match(/^\s*/)![0].length;
  if (rest[lead] !== "{") return rest.slice(lead, rest.indexOf(";", from + lead) - from + 1);
  const open = from + lead;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** The body of the function declared at `at`, found by matching the SIGNATURE's parens first.
 *  A separate helper from blockFrom on purpose: the two bound different things, and the strict
 *  "the block starts here" test that blockFrom needs for a brace-less loop body is exactly wrong
 *  for a declaration, where the next character is `(`. Collapsing them is what broke this file's
 *  first run. */
function functionBodyAt(src: string, at: number): string {
  const open = src.indexOf("(", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return blockFrom(src, i + 1);
  }
  return "";
}

/** Every `for (const x of ARRAY)` loop in the seed whose body creates a library exercise. */
function listsThatCreateLibraryExercises(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(/for\s*\(\s*const\s+\w+\s+of\s+([A-Za-z_$][\w$]*)\s*\)/g)) {
    const body = blockFrom(src, m.index! + m[0].length);
    if (/storage\.createExercise\s*\(\s*libraryOwner\.id/.test(body)) found.push(m[1]);
  }
  return found;
}

describe("the seeded exercise library is flagged Forge-official", () => {
  it("the seed FLAGS what it creates -- the backfill alone cannot, on a fresh database", () => {
    const src = strip(SEED);
    /* Stated as a property of the seed, not as the name of today's helper: what must be true is
     * that the seed writes the flag itself. The call is asserted because that is the only way a
     * source scan can see the write at all; the BEHAVIOUR is proven on real Postgres in the
     * itest beside this file. */
    expect(
      src,
      "server/seed.ts no longer flags the library it creates. reconcile-schema.ts's one-shot " +
        "runs BEFORE the seed on a fresh database (render.yaml: db:reconcile && db:seed && " +
        "db:reconcile) and writes its marker against an empty table, so without a write here " +
        "every seeded exercise is is_forge_official=false for good and every athlete's strength " +
        "percentile matches zero rows.",
    ).toMatch(/storage\.markSeededExercisesForgeOfficial\s*\(/);
  });

  it("FORBIDS a list of library exercises that the flagging step does not cover", () => {
    /* THE RATCHET, and the direction that matters. A scan that iterated the names passed to the
     * flagging step and checked each was created could not see a list nobody passed -- which is
     * precisely the omission it would look like it covered. CLAUDE.md records that exact blindness
     * twice (the public legal-doc assertion iterating the set it was meant to police, so
     * `parental_notice` was invisible; the upload-directory list that could not fail for a
     * directory nobody added). So the discovery runs the other way: find every list the seed
     * really creates exercises from, and require the flagging step to name each one. */
    const src = strip(SEED);
    const lists = listsThatCreateLibraryExercises(src);

    // A floor, so a regex that silently stops matching cannot turn this green.
    expect(
      lists.length,
      "no `for (const x of LIST)` loop in seed.ts calls createExercise(libraryOwner.id, ...) any " +
        "more. Either the seed stopped creating the library (in which case delete this file) or " +
        "this scan has gone blind -- which would make the case below pass for nothing.",
    ).toBeGreaterThanOrEqual(3);

    const callIdx = src.indexOf("markSeededExercisesForgeOfficial");
    const namesDecl = src.indexOf("forgeLibraryNames");
    expect(namesDecl).toBeGreaterThan(-1);
    // Bracket-matched over the array literal, for the same reason blockFrom exists.
    const openBracket = src.indexOf("[", namesDecl);
    let depth = 0;
    let covered = "";
    for (let i = openBracket; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) {
        covered = src.slice(openBracket, i + 1);
        break;
      }
    }
    expect(covered.length).toBeGreaterThan(10);

    for (const list of lists) {
      expect(
        covered.includes(list),
        `seed.ts creates library exercises from \`${list}\` and the Forge-official flagging step ` +
          `does not name it, so every exercise in that list is created with ` +
          `is_forge_official=false and nothing will ever flag it. Add ` +
          `\`...${list}.map((e) => e.name)\` to forgeLibraryNames.`,
      ).toBe(true);
    }

    // And the step must run AFTER the lists it covers, or it flags nothing on a fresh database --
    // the same ordering fault one scope up that this whole file exists for.
    for (const list of lists) {
      expect(
        src.indexOf(`const ${list}`),
        `\`${list}\` is declared after the flagging step, which would flag nothing from it.`,
      ).toBeLessThan(callIdx);
    }
  });

  it("the write is scoped by OWNER and by NAME, never to everything the library owner holds", () => {
    /* The hazard shared/schema.ts argues the explicit column exists to prevent, in its own
     * words: inferring it from ownership "would silently enrol an admin's own personal exercise
     * into the standards every athlete on the platform is measured against". The admin account
     * really does hold hand-made exercises, so a write scoped to the owner alone would do
     * exactly that. Asserted on the storage method's own body, bracket-matched. */
    const src = strip(STORAGE);
    const at = src.indexOf("async markSeededExercisesForgeOfficial");
    expect(at).toBeGreaterThan(-1);
    const body = functionBodyAt(src, at);
    expect(body).toMatch(/eq\s*\(\s*exercises\.coachId\s*,\s*ownerId\s*\)/);
    expect(
      body,
      "markSeededExercisesForgeOfficial no longer filters by NAME, so it flags every exercise " +
        "the library owner holds -- including an admin's own, which is the one thing the " +
        "explicit column exists to keep out of the standards.",
    ).toMatch(/inArray\s*\(\s*exercises\.name\s*,\s*names\s*\)/);
    // Idempotent, and reports what it CHANGED: without this the deploy log would claim a repair
    // on every run forever, which is how a one-off fix comes to read as a recurring fault.
    expect(body).toMatch(/eq\s*\(\s*exercises\.isForgeOfficial\s*,\s*false\s*\)/);
    // It may only ever SET the flag. A write that can clear it would make the admin toggle
    // (an admin may turn an exercise off) undone by the next deploy, silently.
    expect(
      /isForgeOfficial\s*:\s*false/.test(body.replace(/eq\s*\([^)]*\)/g, " ")),
      "markSeededExercisesForgeOfficial can now write the flag FALSE. An admin may deliberately " +
        "turn an exercise off; a seed that clears flags would undo that on every deploy.",
    ).toBe(false);
  });

  it("the strength profile still gates on the stored column, which is what makes this matter", () => {
    /* If these queries ever stop reading the column, this whole file is about nothing -- so the
     * reason is asserted beside the fix rather than left to a reader to rediscover. */
    const src = strip(STORAGE);
    const gates = [...src.matchAll(/is_forge_official\s*=\s*true/g)].length;
    expect(
      gates,
      "the strength-profile queries no longer gate on exercises.is_forge_official. If that is " +
        "deliberate, the seed's flagging step and this file have no purpose and both should go.",
    ).toBeGreaterThanOrEqual(3);
  });
});
