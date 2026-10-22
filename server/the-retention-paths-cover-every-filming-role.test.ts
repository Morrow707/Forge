/**
 * NO RETENTION OR DELETION PATH IS KEYED ON THE WORD "ATHLETE".
 *
 * Added 2026-10-22. The role-conditional survey found this in three places at once
 * (deleteUserRecord's branch, sweepVideoRetentionCap's athlete query, sweepStaleAccountVideos'
 * raw SQL) and the reason it was three and not one is that nothing held them together: each was
 * written to be about "an athlete's videos" at a time when only an athlete could film, and
 * `cameraAccessFor` has granted the camera to a coach and an admin by role alone since long
 * before. A coach who films their own training was exempt from the cap the $9.99 add-on RAISES
 * and left every clip and skeleton trace on the mounted disk when their account was deleted.
 *
 * THE ASSERTION IS STATED AS WHAT IS FORBIDDEN, not as a list of the sites that were fixed.
 * CLAUDE.md has paid for this lesson repeatedly in both directions: a scan that enumerates
 * ACCEPTED forms fails on every correct change and gets "fixed" by lengthening the list
 * (height-ruler-uncertainty.test.ts, twice), and a scan that iterates the set it is meant to
 * police is blind to exactly the omission it looks like it covers (the public legal documents,
 * where `parental_notice` 404'd for as long as the public set existed). So: these functions may
 * not contain an athlete-only role test, and a fourth retention path written next year fails
 * here the day it is added rather than being missed because nobody put it on a list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";

const STORAGE = readFileSync(join(__dirname, "storage.ts"), "utf8");

/** Source with comments removed, for a NEGATIVE assertion.
 *
 *  CLAUDE.md's most repeated self-inflicted failure, four times in one day: prose about what the
 *  code no longer does is indistinguishable from the code still doing it, and the comment
 *  explaining a fix is exactly where the old form gets quoted. Every comment in the three
 *  functions below quotes `eq(users.role, "athlete")` or `u.role = 'athlete'` by name. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** One method's body, bounded by the NEXT `async methodName(` at the same indentation rather
 *  than by a character count. CLAUDE.md records the character-window bug twice and both halves:
 *  a nine-line comment pushes the thing you are looking for out of the window (a false red), and
 *  a fixed window also PASSES for a match that belongs to an unrelated function further down
 *  (the false green, which is worse). */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`  async ${name}(`);
  if (start < 0) return "";
  const rest = src.slice(start + name.length + 10);
  const next = rest.search(/\n  async [a-zA-Z]+\(/);
  return next < 0 ? src.slice(start) : src.slice(start, start + name.length + 10 + next);
}

const ATHLETE_ONLY = [
  // drizzle, both spellings
  /eq\(\s*users\.role\s*,\s*"athlete"\s*\)/,
  /eq\(\s*users\.role\s*,\s*'athlete'\s*\)/,
  // raw SQL
  /\brole\s*=\s*'athlete'/,
  // a bare string comparison on the row
  /\brole\s*===\s*"athlete"/,
];

describe("the retention paths cover every role that films", () => {
  // Named because each one DELETES something. Not an exemption list: every entry here is
  // asserted to be clean, and the point of naming them is that an empty scan would pass.
  const DESTRUCTIVE = ["deleteUserRecord", "sweepVideoRetentionCap", "sweepStaleAccountVideos"];

  it("finds all three destructive paths (so a rename cannot make this vacuously green)", () => {
    for (const name of DESTRUCTIVE) {
      expect(methodBody(STORAGE, name).length, `${name} not found in storage.ts`).toBeGreaterThan(
        300,
      );
    }
  });

  it("none of them tests for the athlete role", () => {
    for (const name of DESTRUCTIVE) {
      const body = codeOnly(methodBody(STORAGE, name));
      for (const pattern of ATHLETE_ONLY) {
        expect(
          body,
          `${name} still narrows by the athlete role (${pattern}) -- a coach or admin who films ` +
            `their own training would be exempt from it`,
        ).not.toMatch(pattern);
      }
    }
  });

  it("each of them reads the filming set instead", () => {
    // The positive half, which is safe against raw source: a comment naming the set while the
    // code narrows by role would fail the negative case above.
    for (const name of DESTRUCTIVE) {
      const body = methodBody(STORAGE, name);
      expect(
        /ROLES_THAT_FILM_THEIR_OWN_TRAINING|filmingRolesSql\(\)/.test(body),
        `${name} should read the filming set`,
      ).toBe(true);
    }
  });

  it("the minor retention sweep covers them too", () => {
    // getVideosEligibleForRetentionPurge is a FOURTH site of the same shape, and the only one of the
    // four where the role word was defensible: shared/roles-that-film-their-own-training.ts says
    // a coach or admin is "an adult account by construction". It is a CONVENTION, not an
    // enforcement -- signupSchema requires a date of birth from a coach as well as an athlete and
    // nothing refuses a minor coach -- and this sweep is DOB-gated anyway, so for every real
    // coach it is a no-op. A minor's data-minimisation promise is the wrong place to rest on a
    // convention.
    const body = codeOnly(methodBody(STORAGE, "getVideosEligibleForRetentionPurge"));
    expect(body.length).toBeGreaterThan(300);
    for (const pattern of ATHLETE_ONLY) expect(body).not.toMatch(pattern);
  });

  it("the research mirror is deliberately NOT widened, and that is the point", () => {
    // trackedAthlete() stays athlete-only. Mirror membership answers "who agreed to be in an
    // extract prepared for an outside party", which is a CONSENT decision; the three above
    // answer "whose training files are these". Same test as the camera registry: is this the
    // same QUESTION, not does it have the same value today. If a future change couples them this
    // case fails and says why.
    expect(STORAGE).toMatch(
      /const trackedAthlete = \(\) => and\(eq\(users\.role, "athlete"\), eq\(users\.trackingOptOut, false\)\)/,
    );
  });

  it("the filming set is still the three roles", () => {
    // A guardian must not be swept. Widening to the filming set and widening to every role are
    // different changes and only one of them is this one.
    expect([...ROLES_THAT_FILM_THEIR_OWN_TRAINING].sort()).toEqual(["admin", "athlete", "coach"]);
  });
});
