import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { patchLiveDocuments } from "./signup-agreement";
import * as CURRENT from "./legal-documents-draft";
import { nextParentalNotice, nextPrivacyPolicy } from "./legal-documents-draft";

/** EVERY VERSION FORGE EVER SEEDED HAS TO REACH THE CURRENT ONE.
 *
 * LIVE_DOCUMENT_PATCHES is an ordered list of exact-match replacements, and order is a thing you
 * can get wrong invisibly. Two ways it had been, both found by replaying history rather than by
 * reading the list:
 *
 *   - A patch anchored on a NEIGHBOURING SECTION NUMBER only fires when it happens to run after
 *     whichever patch last renumbered that section. An installation that skipped a release
 *     arrives with the numbering of neither, and the patch silently does nothing.
 *   - The patches that prepend Forge's postal address match a contact SENTENCE, and the patch
 *     that writes that sentence ran later in the list. So an installation old enough to still
 *     hold the email placeholder got the address patch skipped, then the sentence written
 *     without an address -- in the section whose whole job is telling somebody how to reach
 *     Forge. Five of nine historical versions were stranded somewhere by that one.
 *
 * Nothing about either was visible in the file. Both were visible the moment every past version
 * was run through the list. So this replays them, rather than trusting a list of the ones
 * somebody remembered. */
const DOC_FILE = "server/seed-data/legal-documents-draft.ts";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: join(import.meta.dirname, "../.."), maxBuffer: 32e6 }).toString();
}

/** Every commit that touched the documents file, oldest first. */
function historicalVersions(): string[] {
  return git("log", "--format=%h", "--reverse", "--", DOC_FILE).trim().split("\n").filter(Boolean);
}

describe("migrating a stored document from any version Forge ever shipped", () => {
  const commits = historicalVersions();

  it("can see the history it needs", () => {
    // A shallow clone gives one commit and every case below would vacuously pass. CI checks out
    // with fetch-depth: 0 for exactly this.
    expect(
      commits.length,
      "only one revision of the legal documents is visible -- this is a shallow clone, and the " +
        "migration cases below would pass without testing anything. Fetch full history.",
    ).toBeGreaterThan(3);
  });

  it.each(commits)("%s reaches the current text and stays there", async (commit) => {
    // Written INSIDE this directory rather than a temp dir: the historical file imports
    // "@shared/contact", and that alias only resolves for files inside the project.
    const file = join(import.meta.dirname, `__historical_${commit}.ts`);
    try {
      writeFileSync(file, git("show", `${commit}:${DOC_FILE}`));
      const historical = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;

      for (const [name, current] of Object.entries(CURRENT)) {
        if (typeof current !== "string") continue;
        const stored = historical[name];
        // A document that did not exist yet at that commit has nothing to migrate from.
        if (typeof stored !== "string") continue;
        // The same two steps seed.ts runs, in the same order. The parental notice has a
        // shipped-version lane of its own (it is DELIVERED, not published, so a correction has to
        // reach an installation that already seeded it); everything else is patches only.
        // The same order seed.ts runs: a document with a version lane gets replaced wholesale
        // first, then everything goes through the patches.
        const lane =
          name === "PARENTAL_NOTICE_DRAFT"
            ? nextParentalNotice
            : name === "PRIVACY_POLICY_DRAFT"
              ? nextPrivacyPolicy
              : null;
        const seeded = lane ? lane(stored) ?? stored : stored;
        const migrated = patchLiveDocuments(seeded) ?? seeded;
        expect(migrated, `${name} stored at ${commit} does not reach its current text`).toBe(current);
        expect(
          patchLiveDocuments(migrated),
          `${name} keeps changing after it is current -- a patch is re-firing on its own output`,
        ).toBeNull();
        if (lane) expect(lane(migrated)).toBeNull();
      }
    } finally {
      rmSync(file, { force: true });
    }
  });
});
