import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE WORKOUT SCREEN HYDRATES FROM A FETCH, NEVER FROM A CACHED PICTURE OF THE DAY, AND THE
 * SERVER REFUSES A SAVE THAT MAKES NO CLAIM ABOUT A DAY THAT HAS A REVISION.
 *
 * 2026-11-05, 19:11 UTC, read off the Render log: the day was opened empty at 18:59 (2.6KB),
 * three camera sets were filmed and saved live, the screen was reopened and React Query handed
 * it the 18:59 copy from its cache a beat before the refetch (30KB, the three sets) landed. The
 * hydration effect fired on the cached copy, latched, and ignored the fresh one; the next
 * autosave carried three exercises with no sets and no `baseRevision` (the cached day had no
 * log), the server's check let a claim-less save through as "an older client", and at 19:12:02
 * the day read 3.7KB. Back Squat, Romanian Deadlift and Box Jump set 1 -- rows, clips, traces --
 * deleted by a screen that had never read them.
 *
 * Two halves, each enough on its own and both kept: the screen only hydrates from data fetched
 * after it asked (mount, and again after a 409), and the server treats a claim-less save over an
 * existing log as the stale screen it is. Every case states what is FORBIDDEN or bounds the
 * thing it reads by its own brackets; nothing here is a character window.
 *
 * The comment strip is defensive today: no comment in either file quotes a form a case matches.
 * It stays because the next case added will not know that.
 */

const ROOT = path.resolve(__dirname, "../../..");
const WORKOUT = strip(readFileSync(path.join(ROOT, "client/src/pages/workout.tsx"), "utf8"));
const STORAGE = strip(readFileSync(path.join(ROOT, "server/storage.ts"), "utf8"));

/** Line-aware comment strip -- the shape skills-need-entitlement.test.ts carries, and why. */
function strip(s: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      out.push("");
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      out.push("");
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let quote: string | null = null;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && line[i + 1] === "/") {
        cut = i;
        break;
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join("\n");
}

/** A brace-delimited block starting at the first `{` at or after `from`, by matching its own braces. */
function blockAt(s: string, from: number): string {
  const open = s.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return s.slice(open, i + 1);
    }
  }
  return s.slice(open);
}

/** The condition of the `if (` at `from`, by matching its own parens. */
function conditionAt(s: string, from: number): string {
  const open = s.indexOf("(", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return "";
}

/** A function's body: paren-match the signature, then the first `{` at angle-bracket depth zero. */
function functionBodyAt(s: string, from: number): string {
  const open = s.indexOf("(", from);
  if (open < 0) return "";
  let depth = 0;
  let afterParams = -1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams < 0) return "";
  let angle = 0;
  for (let i = afterParams; i < s.length; i++) {
    const c = s[i];
    if (c === "<") angle++;
    else if (c === ">") angle--;
    else if (c === "{" && angle === 0) return blockAt(s, i);
  }
  return "";
}

/** The `if (` whose condition most immediately precedes `at`. */
function conditionBefore(s: string, at: number): string {
  const ifAt = s.lastIndexOf("if (", at);
  expect(ifAt).toBeGreaterThan(-1);
  return conditionAt(s, ifAt);
}

describe("the workout screen hydrates from a fetch, never from a cached picture of the day", () => {
  it("reads dataUpdatedAt off the day query", () => {
    const query = WORKOUT.match(/const \{[^}]*\} = useQuery<DayDetail>\(/);
    expect(query, "the day query").not.toBeNull();
    expect(query![0]).toContain("dataUpdatedAt");
  });

  it("the hydration effect only builds state from data fetched after it asked for it", () => {
    const latch = WORKOUT.indexOf("setHydrated(true)");
    expect(latch).toBeGreaterThan(-1);
    const effectAt = WORKOUT.lastIndexOf("useEffect(", latch);
    const body = blockAt(WORKOUT, WORKOUT.indexOf("=>", effectAt));
    expect(body).toContain("setHydrated(true)");
    const guard = conditionAt(body, body.indexOf("if ("));
    expect(guard).toContain("!hydrated");
    expect(guard).toContain("dataUpdatedAt >= hydrateFromFetchesAfterRef.current");
  });

  it("FORBIDS the guard that hydrated from whatever data was in hand", () => {
    expect(WORKOUT).not.toMatch(/if \(data && !hydrated\)\s*\{/);
  });

  it("the 409 recovery asks for a rehydration from the REFETCH before dropping the latch", () => {
    const onError = WORKOUT.indexOf("onError: (err: ApiError");
    expect(onError).toBeGreaterThan(-1);
    const branchAt = WORKOUT.indexOf("if (err.status === 409)", onError);
    const branch = blockAt(WORKOUT, branchAt);
    const stamp = branch.indexOf("hydrateFromFetchesAfterRef.current = Date.now()");
    const drop = branch.indexOf("setHydrated(false)");
    expect(stamp).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(stamp);
  });

  it("draws the loading state until hydration, so a cached day with no sets is never on screen", () => {
    expect(WORKOUT).toMatch(/if \(isLoading \|\| !data \|\| !hydrated\)/);
  });

  it("the lost-response catch-up treats no revision as one before the first", () => {
    const marker = WORKOUT.indexOf("&& lostResponsePossibleRef.current");
    expect(marker).toBeGreaterThan(-1);
    const condition = conditionBefore(WORKOUT, marker);
    expect(condition).toContain("err.status === 409");
    expect(condition).not.toContain("baseRevisionRef.current != null");
    expect(WORKOUT).toContain("(baseRevisionRef.current ?? -1) + 1");
  });

  it("a synced save that carried a capture refreshes the cached day", () => {
    const at = WORKOUT.indexOf("sentCaptureKeys?.length ?? 0) > 0");
    expect(at).toBeGreaterThan(-1);
    const condition = conditionBefore(WORKOUT, at);
    expect(condition).toContain("synced");
    const body = blockAt(WORKOUT, at);
    expect(body).toContain("invalidateQueries({ queryKey: [`${apiBase}/day`] })");
  });
});

describe("the server refuses a save with no revision claim once the day has a log", () => {
  it("submitWorkoutLog throws StaleWorkoutLogError on a null claim as on a wrong one", () => {
    const at = STORAGE.indexOf("async submitWorkoutLog(");
    expect(at).toBeGreaterThan(-1);
    const body = functionBodyAt(STORAGE, at);
    const throwAt = body.indexOf("throw new StaleWorkoutLogError(log.revision)");
    expect(throwAt).toBeGreaterThan(-1);
    const condition = conditionBefore(body, throwAt);
    expect(condition).toContain("input.baseRevision == null ||");
    expect(condition).toContain("input.baseRevision !== log.revision");
    expect(condition).not.toContain("input.baseRevision != null &&");
  });
});
