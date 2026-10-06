import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* THE HYDRATE-IN-AN-EFFECT SHAPE, AS A SCAN RATHER THAN A PARAGRAPH.
 *
 * CLAUDE.md carries this shape as prose, ending "There is no scan for this one, deliberately...
 * if somebody finds a reliable way to detect the shape, a scan beats a paragraph." The attempt
 * it describes matched thirty files because it searched for "a read, an effect and a write",
 * which is most of the app.
 *
 * The reliable marker is narrower: the HYDRATION LATCH itself. A file that declares
 * `setHydrated` is copying query data into local state once and guarding the editor or the
 * spinner on that latch, which is the exact shape. On a failed read the effect never runs, the
 * latch never flips, and the file does one of two things -- renders an empty editor whose Save
 * writes that emptiness over the real record, or spins forever on `isLoading || !hydrated`.
 *
 * Eight non-test files declare the latch today and all eight handle `isError`. The fix is the same in
 * both cases: give the query `isError` and render a read-failure state BEFORE the editor or the
 * spinner, so the editor does not open until the read lands.
 *
 * The four destructive instances this shape produced (a rename PATCHing the default Group A/B/C
 * over a coach's real groups; an empty box over the live signup agreement; the same over a legal
 * document; a Save deleting every lesson and quiz question in an academy track) replaced whole
 * records, which no field-level validation catches. Audited and confirmed fixed 2026-10-06; this
 * scan is what keeps the ninth file from reintroducing it.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(join(process.cwd(), "client/src"));

describe("a screen that hydrates query data into state handles a failed read", () => {
  // setHydrated, setHydratedFor, and any other spelling of the same latch -- two dialogs key
  // theirs on the id of the record they loaded rather than a bare boolean, and they are the
  // same shape with the same failure.
  const latched = files.filter((f) => /setHydrated\w*\(/.test(readFileSync(f, "utf8")));

  it("finds the hydration latch where it is known to live", () => {
    // If this drops to zero the scan has stopped scanning -- the failure mode of every ratchet
    // in this repo that was written as a list.
    expect(latched.length).toBeGreaterThanOrEqual(8);
  });

  // Named in the failure message, not listed in the test: a new file is picked up by the walk.
  it.each(latched.map((f) => [f.replace(`${process.cwd()}/`, ""), f] as const))(
    "%s reads isError",
    (_label, path) => {
      const src = readFileSync(path, "utf8");
      expect(
        src.includes("isError"),
        `${path} latches on setHydrated but never reads isError. On a failed read the effect ` +
          `never runs, so the latch never flips: either the editor renders empty and Save ` +
          `writes that emptiness over the real record, or the page spins forever. Give the ` +
          `query isError and render the read-failure state before the editor or the spinner. ` +
          `See "Hydrate-in-an-effect, save-the-whole-state" in CLAUDE.md.`,
      ).toBe(true);
    },
  );
});
