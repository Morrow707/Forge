import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** A FAILED READ MUST NOT RENDER AS "THERE IS NOTHING HERE".
 *
 * Almost every read here is written `const { data = [], isLoading } = useQuery(...)`, then
 * `isLoading ? <spinner> : data.length === 0 ? <"nothing logged"> : <list>`. When the request
 * fails, react-query leaves data undefined, the `= []` default makes it an empty array, and
 * isLoading goes false -- so the screen states as fact that the athlete has no injuries, no
 * movement screens, no training load. A coach reads that and programs a session on it.
 *
 * A SWEEP FOUND 82 SUCH FILES. Fixing them in one change would have been a diff nobody could
 * review, so this began as a ratchet: every offender listed, the list allowed only to get
 * shorter, and any file not on it required to handle the failure.
 *
 * THE LIST IS NOW EMPTY, so this is a wall rather than a ratchet -- every read in client/src
 * either distinguishes a failure from an absence or does not claim emptiness at all. The
 * mechanism does not change: KNOWN stays, and it stays empty. A new screen with this bug fails
 * the first assertion below, and the fix is four lines of isError in that screen, never a line
 * added here. Keeping the machinery costs nothing and is what stops the backlog growing back.
 *
 * What the sweep turned up along the way, and what makes this worth more than tidy error
 * states: several of these were not display bugs at all. An editor hydrated from a failed read
 * saved its own emptiness over a live legal document and over a coach's roster groups; an
 * assign dialog built an assignment from a schedule it never received and put every session on
 * the wrong day; a lesson reader offered "Finish Reading" for a lesson that never rendered; a
 * dashboard reported "Flagged today: 0" without having asked. See CLAUDE.md,
 * "Hydrate-in-an-effect, save-the-whole-state", for the shape behind the first two.
 *
 * To fix a new one: give the query isError/refetch and render <ReadFailed> (see
 * client/src/components/read-failed.tsx).
 */

const ROOT = path.join(process.cwd(), "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** A file is an offender when it reads something, claims emptiness off a length check, and has
 * no notion of the read having failed anywhere in it. Deliberately crude: it is a tripwire for
 * the shape, not a proof that every branch is right. */
/** Comments stripped first. The component that FIXES this bug documents the bug by quoting it,
 * and the scan duly reported the cure as a case of the disease. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of walk(ROOT)) {
    const src = code(fs.readFileSync(file, "utf8"));
    if (!/useQuery[<(]/.test(src)) continue;
    if (/\bisError\b/.test(src)) continue;
    if (!/\.length === 0/.test(src)) continue;
    found.push(path.relative(path.join(process.cwd(), "client", "src"), file).replace(/\\/g, "/"));
  }
  return found.sort();
}

/** Known offenders. EMPTY, AND MEANT TO STAY THAT WAY -- only ever remove, never add. */
const KNOWN = new Set<string>([]);

describe("a failed read is never rendered as an empty one", () => {
  const current = offenders();

  it("has no offender that is not already known", () => {
    // A NEW screen with this bug is the thing this test exists to stop. Adding a line here to
    // make it pass is the wrong fix -- the right one is four lines of isError in the screen.
    expect(current.filter((f) => !KNOWN.has(f))).toEqual([]);
  });

  it("does not leave a fixed file on the list", () => {
    // Kept the backlog honest while there was one: a file that had been cleared had to come
    // off, or the number stopped meaning anything. With KNOWN empty this can only fail if
    // somebody adds a line to it, which is the wrong fix for this bug and is the other thing
    // worth catching.
    const stale = [...KNOWN].filter((f) => !current.includes(f)).sort();
    expect(stale).toEqual([]);
  });

  it("still finds the files it is meant to be scanning", () => {
    // The failure mode of a scan-based test is silently matching nothing -- a moved
    // directory, a changed extension, a regex that stopped matching -- after which it
    // passes forever while checking nothing at all.
    //
    // This used to assert the OFFENDER count was above 20, which conflated two
    // different things and duly broke the moment the backlog got down to 18: doing the
    // work made the alarm go off. The offender count is supposed to fall to zero. What
    // must NOT fall is the scan's reach, so that is what this measures now -- how many
    // files it is looking at, which only shrinks if the scan itself is broken.
    const scanned = walk(ROOT);
    expect(scanned.length).toBeGreaterThan(100);
    const withReads = scanned.filter((f) => /useQuery[<(]/.test(code(fs.readFileSync(f, "utf8"))));
    expect(withReads.length).toBeGreaterThan(50);
  });
});

describe("the surfaces already cleared", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("say plainly that a failure is not an absence", () => {
    expect(read("client/src/components/read-failed.tsx")).toContain(
      "That isn't the same as there being none.",
    );
  });

  it.each([
    // Round one: what a coach consults to decide whether somebody is safe to train.
    ["injury history", "client/src/components/injury-history-panel.tsx"],
    ["training load", "client/src/components/acwr-history-dialog.tsx"],
    ["movement screens", "client/src/components/movement-screen-panel.tsx"],
    ["weakness reports", "client/src/components/weakness-report-panel.tsx"],
    ["the hours cap", "client/src/components/cara-compliance-panel.tsx"],
    // Round two: the athlete's own record, where an empty state is a claim about their history.
    ["testing history", "client/src/components/testing-history-panel.tsx"],
    ["wellness check-ins", "client/src/components/wellness-history-dialog.tsx"],
    ["range-of-motion readings", "client/src/components/goniometer-panel.tsx"],
    ["skill sessions", "client/src/components/skill-sessions-panel.tsx"],
    ["goals", "client/src/components/goals-panel.tsx"],
    ["the food log", "client/src/components/food-log-panel.tsx"],
    ["PR history", "client/src/pages/athlete/lift-history.tsx"],
    ["the roster", "client/src/pages/coach/roster.tsx"],
  ])("%s handles the read failing", (_what, file) => {
    const src = read(file);
    expect(src).toMatch(/\bisError\b|isError:/);
    expect(src).toContain("<ReadFailed");
  });
});
