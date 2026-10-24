import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { exercises } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase, makeCoach, makeExercise } from "./test-support/fixtures";

/**
 * THE FORGE-OFFICIAL FLAG, PROVED ON REAL POSTGRES.
 *
 * The companion `.test.ts` scans the seed and the storage method and so can only ever assert
 * that the right words are present. What a scan cannot see is the one property this write exists
 * to have: that it flags the library Forge ships and CANNOT reach an exercise an admin made by
 * hand. `shared/schema.ts` argues at length that inferring the flag from ownership "would
 * silently enrol an admin's own personal exercise into the standards every athlete on the
 * platform is measured against, with nothing to say so" -- and production really does hold such
 * an exercise under the admin account that owns the library. So the guard is measured here, not
 * asserted in a regex.
 *
 * Why this is an itest rather than a unit test with a mocked db: the write is one UPDATE with a
 * three-part WHERE, so mocking the query builder would be asserting against the mock -- the
 * reason CLAUDE.md gives for `storage.ts` having an integration suite at all.
 */
describe("markSeededExercisesForgeOfficial", () => {
  let owner: number;
  let otherCoach: number;

  beforeEach(async () => {
    await resetDatabase();
    owner = (await makeCoach({ role: "admin", name: "Forge" })).id;
    otherCoach = (await makeCoach()).id;
  });

  const flagOf = async (id: number) => {
    const row = await db.query.exercises.findFirst({ where: eq(exercises.id, id) });
    return row?.isForgeOfficial;
  };

  it("flags the library owner's exercises that the seed ships, by name", async () => {
    const squat = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });
    const bench = await makeExercise(owner, { name: "Bench Press", isForgeOfficial: false });

    const changed = await storage.markSeededExercisesForgeOfficial(owner, [
      "Back Squat",
      "Bench Press",
    ]);

    expect(changed).toBe(2);
    expect(await flagOf(squat.id)).toBe(true);
    expect(await flagOf(bench.id)).toBe(true);
  });

  it("NEVER touches an exercise the admin made by hand, which is the whole hazard", async () => {
    /* The exercise that exists on production today: owned by the same admin account that owns
     * the library, deliberately not Forge-official, and so deliberately not part of the
     * standards every athlete is scored against. A write scoped to the OWNER alone -- the
     * obvious shortcut -- enrols it, and nothing on any screen would say so. */
    const mine = await makeExercise(owner, { name: "Mcconnell Raises", isForgeOfficial: false });
    const shipped = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });

    const changed = await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"]);

    expect(changed).toBe(1);
    expect(await flagOf(shipped.id)).toBe(true);
    expect(
      await flagOf(mine.id),
      "an admin's own exercise was flagged Forge-official, so it has silently joined the " +
        "standards every athlete on the platform is measured against",
    ).toBe(false);
  });

  it("never reaches another coach's exercise of the same name", async () => {
    /* A coach may legitimately name their own lift "Back Squat". Scoping by name alone would
     * make every such exercise on the platform a Forge standard. */
    const theirs = await makeExercise(otherCoach, { name: "Back Squat", isForgeOfficial: false });
    const ours = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });

    const changed = await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"]);

    expect(changed).toBe(1);
    expect(await flagOf(ours.id)).toBe(true);
    expect(await flagOf(theirs.id)).toBe(false);
  });

  it("is idempotent, and reports what it CHANGED rather than what matched", async () => {
    /* The deploy log is the only place an operator learns this repair ran. If the count were
     * what MATCHED, every deploy forever would claim to have fixed 410 exercises, and a line
     * that appears on every run is a line nobody reads -- so a one-off repair would come to
     * read as a recurring fault. */
    await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });

    expect(await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"])).toBe(1);
    expect(await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"])).toBe(0);
    expect(await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"])).toBe(0);
  });

  it("writes nothing at all for an empty list", async () => {
    /* SCAN-ONLY IN EFFECT, AND SAID SO RATHER THAN IMPLIED. Mutation-tested: deleting the
     * `names.length === 0` guard leaves this case GREEN, because `inArray(col, [])` already
     * compiles to a false predicate in this drizzle version -- so the guard is belt-and-braces
     * and this case proves the OUTCOME, not the guard. It stays because the outcome is the thing
     * that matters (the one thing worse than flagging nothing is flagging everything) and
     * because a driver change could make the empty case behave differently without any other
     * case here noticing. Same honesty as the unlimited-cap no-op in
     * `the-favorited-cap-covers-drills-too.test.ts`, which records the identical situation. */
    const untouched = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });

    expect(await storage.markSeededExercisesForgeOfficial(owner, [])).toBe(0);
    expect(await flagOf(untouched.id)).toBe(false);
  });

  it("only ever sets the flag -- an admin's decision to turn one off survives a deploy", async () => {
    /* An admin may flip a Forge exercise off (routes.ts exposes exactly that). The seed runs on
     * every deploy, so a write that could clear the flag would undo that choice silently and
     * repeatedly. The method cannot express it; this proves the shipped one does not. */
    const off = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: true });

    const changed = await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"]);

    expect(changed).toBe(0);
    expect(await flagOf(off.id)).toBe(true);
  });

  it("the strength-profile gate really does read this column", async () => {
    /* The reason the rest of this file matters, held against the live query rather than against
     * a comment: an exercise the gate would accept, and one it would not, separated by nothing
     * but this flag. */
    const scored = await makeExercise(owner, { name: "Back Squat", isForgeOfficial: false });
    const ignored = await makeExercise(owner, { name: "Coach's Own Squat", isForgeOfficial: false });

    await storage.markSeededExercisesForgeOfficial(owner, ["Back Squat"]);

    const official = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.isForgeOfficial, true), inArray(exercises.id, [scored.id, ignored.id])));

    expect(official.map((r) => r.id)).toEqual([scored.id]);
  });
});
