import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";

/**
 * A FAVORITED DRILL CLIP WAS EXEMPT FROM THE CAP THE PAID ADD-ON RAISES.
 *
 * Two retention rules exist and they are enforced in two different places. The TOTAL cap is a
 * background sweep with a grace window and a warning (server/video-retention-job.ts), and it has
 * always covered both sides -- its rows carry `source: "set" | "skill"`. The FAVORITED cap is a
 * synchronous trim on save, because un-favoriting deletes nothing and so needs no grace window,
 * and it read workout tables only: one query joining workoutSetEntries -> workoutLogEntries ->
 * workoutLogs, one caller, submitWorkoutLog.
 *
 * So an athlete could favorite every drill clip they ever recorded and nothing trimmed them. The
 * cap is what the $9.99 storage add-on raises (5 -> 10 favorited), which makes an unenforced cap
 * on one side of the app a thing somebody paid for and did not get -- and, on a minor's account,
 * a data-minimisation promise (see minor-video-retention.test.ts) going unkept for drills.
 *
 * Found by the 2026-10-14 billing audit panel.
 */

const SERVER = resolve(import.meta.dirname);
const read = (f: string) => readFileSync(resolve(SERVER, f), "utf8");
// Line comments first, then block -- a `/*` inside a line comment pairs with the next real `*/`
// if the block pass runs first and swallows everything between, leaving a scan reading a fraction
// of the file while still passing. See a-typed-number-buys-nothing.test.ts' identical note.
const stripComments = (src: string) =>
  src.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const storage = stripComments(read("storage.ts"));

const skillTrim = (() => {
  const at = storage.indexOf("async function enforceSkillVideoRetention");
  return at < 0 ? "" : storage.slice(at, storage.indexOf("\n}\n", at));
})();

const createSkillSessionLog = (() => {
  const at = storage.indexOf("async createSkillSessionLog(");
  return storage.slice(at, storage.indexOf("\n  },", at));
})();

// The method's body from the row-building onward -- i.e. past the capFavorites closure, whose own
// `return row;` hands back the row it was given and is not one of the save path's exits.
const saveBranches = createSkillSessionLog.slice(createSkillSessionLog.indexOf("const values = {"));

describe("the drill side has a favorited-cap trim at all", () => {
  it("exists, and reads the skill tables rather than the workout ones", () => {
    expect(skillTrim).not.toBe("");
    expect(skillTrim).toContain("skillSessionLogs");
    expect(skillTrim).not.toContain("workoutSetEntries");
  });

  it("orders oldest-favorite-first and un-favorites rather than deleting", () => {
    // Un-favoriting is reversible and costs nothing; a synchronous DELETE on save would remove
    // an athlete's footage with no warning and no grace window, which is the whole reason the
    // total cap is a sweep instead of this. Same rule as the strength twin.
    expect(skillTrim).toContain("asc(skillSessionLogs.createdAt)");
    expect(skillTrim).toContain("videoFavorited: false");
    expect(skillTrim).not.toMatch(/deleteUploadedFile|db\s*\n?\s*\.delete\(/);
  });

  it("counts only rows that actually have a clip", () => {
    // A row with no video is not using storage, so counting it toward the cap would un-favorite
    // somebody's real footage to make room for a favorite flag on nothing.
    expect(skillTrim).toContain("isNotNull(skillSessionLogs.videoUrl)");
  });

  it("returns before querying anything when the cap is unlimited", () => {
    // Comped, enforcement off, mid-trial. Pinned HERE and not in the itest on purpose: with the
    // guard removed the comparison is `length > Infinity`, which is false, so the rows are
    // unchanged and no observable behaviour differs -- the guard saves a query per save, and a
    // scan is the only thing that can hold it. (Mutation-tested: removing it turns this case red
    // and leaves the itest green, which is why both files exist.)
    expect(skillTrim).toContain("if (!Number.isFinite(limits.favoritedCap)) return;");
  });

  it("filters on the row's own athleteId, not a join through skillDayLogs", () => {
    // skillDayLogId is NULLABLE -- createSkillSessionLog's plain-append fallback (a client that
    // sent no date/setNumber) leaves it null -- so an inner join would silently skip exactly
    // those rows and the cap would be unenforceable for them. This is the mutation that passes
    // every other assertion in this file.
    expect(skillTrim).toContain("eq(skillSessionLogs.athleteId, athleteId)");
    expect(skillTrim).not.toContain("innerJoin(skillDayLogs");
  });
});

describe("every exit from the save path runs it", () => {
  // There are three: the re-record UPDATE of an existing slot, the slotted INSERT, and the plain
  // append. A cap enforced on two of three paths is not a cap, and which path a save takes is
  // decided by what the client happened to send (setNumber + date, or neither).
  it("calls it on all three returns and leaves no bare one behind", () => {
    const calls = createSkillSessionLog.match(/return capFavorites\(row\);/g) ?? [];
    expect(calls).toHaveLength(3);
    expect(saveBranches).not.toMatch(/\n\s*return row;/);
  });

  it("resolves the limits from the athlete's own account", () => {
    // The cap a save is trimmed to is the one THIS athlete paid for (or, for a minor, the one
    // their age imposes regardless of any billing flag).
    expect(createSkillSessionLog).toContain("getVideoRetentionLimits({");
    expect(createSkillSessionLog).toContain("hasVideoStorageAddOn: athlete?.hasVideoStorageAddOn ?? false");
    expect(createSkillSessionLog).toContain("dateOfBirth: athlete?.dateOfBirth ?? null");
  });

  it("decides from the athlete's history, not from what this one save sent", () => {
    // The cap is a property of (athlete, drill) across every clip they have ever kept, so the
    // trim must not be conditioned on THIS save carrying a video or being favorited itself.
    // That is the shape the strength twin's own comment exists to warn about -- a resubmission
    // with no new video still changes which clips are favorited -- and the plausible mutation is
    // an early `if (!videoUrl) return row;` at the top of the closure, which today happens to be
    // behaviour-neutral (a favorite only ever arrives attached to a video) and would stop being
    // so the moment favoriting gets a request of its own, silently.
    //
    // Asserted as what the closure MAY read rather than as the absence of one phrasing of the
    // guard: a negative regex only catches the wording somebody happened to think of.
    const closure = createSkillSessionLog.slice(
      createSkillSessionLog.indexOf("const capFavorites ="),
      createSkillSessionLog.indexOf("const values = {"),
    );
    expect(closure).toContain("enforceSkillVideoRetention(");
    expect(closure).not.toMatch(/videoUrl/);
    expect(closure).not.toMatch(/videoFavorited/);
    // And nothing returns out of it ahead of the trim.
    expect(closure.indexOf("return")).toBeGreaterThan(closure.indexOf("enforceSkillVideoRetention("));
  });
});

describe("the cap this is enforcing is the one the add-on sells", () => {
  it("is finite on the free tier and higher with the add-on", () => {
    // If these were ever equal the add-on would be selling nothing, and if the base were
    // infinite this trim would never fire for anybody.
    expect(Number.isFinite(VIDEO_RETENTION.favoritedCap)).toBe(true);
    expect(VIDEO_STORAGE_ADD_ON.favoritedCap).toBeGreaterThan(VIDEO_RETENTION.favoritedCap);
  });
});
