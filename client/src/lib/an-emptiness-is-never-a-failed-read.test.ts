import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/** AN EMPTY BOARD AND A BOARD THAT DID NOT LOAD ARE DIFFERENT THINGS, AND THE LATEST POST IS
 *  THE FIRST ONE.
 *
 * Three findings in one pair of files, 2026-10-24, from the role survey's last unread targets.
 * `team-chat-quick-summary.tsx` has no role conditional in it at all, which is why seven slices
 * of `role ===` greps never reached it.
 *
 * 1. IT SHOWED THE OLDEST POST AS THE LATEST. `getTeamBoardPosts` orders
 *    `desc(teamPosts.createdAt)` -- newest first -- and the card took
 *    `posts[posts.length - 1]`. So the Team Chat quick-view rendered the first thing the coach
 *    ever wrote, under a heading that means the newest, with its own correct "3 months ago"
 *    beside it. The full board renders the same list in the order it arrives and was always
 *    right; only this card re-derived the ordering.
 * 2. NEITHER TEAM-BOARD READER DISTINGUISHED A FAILED READ FROM AN EMPTY ONE. The card said
 *    "No posts yet." and the board said "No posts yet, be the first to ask something" -- an
 *    invitation to repeat a question the board had already answered. Worse on the card, where
 *    the unread dot comes from a SEPARATE query: a dot that loaded beside a list that did not
 *    is self-contradictory on screen.
 * 3. THE BELL TOLD A GUARDIAN TO EXPECT TWO THINGS THEY CAN NEVER RECEIVE. Its empty state was
 *    coach-or-everyone-else, and `storage.requestDocuments` is the only writer in the repo that
 *    addresses a guardian -- so the fallback promised coach replies and team announcements and
 *    omitted the paperwork request, which is the notification this bell exists for.
 *
 * STATED AS RULES OVER DISCOVERED FILES, never as a list of the three that were fixed.
 */

const CLIENT_SRC = join(import.meta.dirname, "..");
const REPO = join(CLIENT_SRC, "..", "..");

/** A negative assertion against raw source cannot tell prose about the old form from the old
 * form, and every comment added by this fix quotes it. Proven load-bearing below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const CLIENT_FILES = walk(CLIENT_SRC);

/** Every client file that reads a team board, found by its query rather than named. */
function teamBoardReaders(): { path: string; source: string }[] {
  return CLIENT_FILES.map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /useQuery<TeamPost\[\]>/.test(stripComments(source)));
}

describe("the team board's own readers", () => {
  it("found them, so the rules below are not vacuous", () => {
    const readers = teamBoardReaders().map((r) => r.path.slice(CLIENT_SRC.length + 1));
    expect(readers.sort()).toEqual([
      join("components", "team-board.tsx"),
      join("components", "team-chat-quick-summary.tsx"),
    ]);
  });

  it("the server still returns them newest first, which is what 'the latest' depends on", () => {
    const storage = stripComments(readFileSync(join(REPO, "server", "storage.ts"), "utf8"));
    const at = storage.indexOf("async getTeamBoardPosts(");
    expect(at).toBeGreaterThan(-1);
    const body = storage.slice(at, storage.indexOf("\n  },", at));
    expect(body).toMatch(/orderBy:\s*desc\(teamPosts\.createdAt\)/);
  });

  it("never takes the latest post off the END of that list", () => {
    // FORBIDDEN, not a list of accepted spellings: indexing from the end of a newest-first list
    // is the bug, in any form. A reader that wants the oldest post would have to say so.
    for (const { path, source } of teamBoardReaders()) {
      const bare = stripComments(source);
      expect(
        /\.length\s*-\s*1\s*\]/.test(bare),
        `${path.slice(CLIENT_SRC.length + 1)} indexes the end of the post list -- getTeamBoardPosts orders newest first, so that is the OLDEST post`,
      ).toBe(false);
    }
  });

  it("tells a failed read apart from an empty board", () => {
    for (const { path, source } of teamBoardReaders()) {
      const bare = stripComments(source);
      const name = path.slice(CLIENT_SRC.length + 1);
      expect(bare, `${name} never checks isError`).toMatch(/isError/);
      expect(bare, `${name} does not render ReadFailed`).toMatch(/<ReadFailed/);
      // The emptiness must be GUARDED by the failure, or both render at once and the card says
      // two contradictory things.
      expect(
        /postsFailed/.test(bare),
        `${name} has an isError but the empty state does not consult it`,
      ).toBe(true);
    }
  });
});

describe("the notification bell's empty state", () => {
  const bell = stripComments(
    readFileSync(join(CLIENT_SRC, "components", "notification-bell.tsx"), "utf8"),
  );

  it("names what a guardian actually receives, and neither of the two they cannot", () => {
    const at = bell.indexOf("notifications.length === 0");
    expect(at).toBeGreaterThan(-1);
    const block = bell.slice(at, bell.indexOf("</p>", at));
    expect(block).toMatch(/role === "guardian"/);
    const guardianBranch = block.slice(block.indexOf('role === "guardian"'));
    const sentence = guardianBranch.slice(0, guardianBranch.indexOf(":", guardianBranch.indexOf("?")));
    // FORBIDDEN in the guardian's own sentence: the two things no writer ever sends them.
    expect(sentence.toLowerCase()).not.toContain("team announcement");
    expect(sentence.toLowerCase()).not.toContain("coach repl");
    expect(sentence.toLowerCase()).toMatch(/paperwork|document/);
  });

  it("is the one kind of notification anything writes to a guardian", () => {
    // The premise. If a second writer ever addresses a guardian, that sentence is incomplete
    // and this is where it should be noticed -- discovered from the source, not asserted.
    const storage = readFileSync(join(REPO, "server", "storage.ts"), "utf8");
    const bare = stripComments(storage);
    const guardianNotifications = [...bare.matchAll(/createNotification\(\s*g\.id,\s*\n?\s*"([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(guardianNotifications).toEqual(["documents_requested"]);
  });

  it("still distinguishes a failed read from an empty inbox", () => {
    // This one was already right and is pinned so the guardian branch cannot be added by
    // rewriting the block and losing it.
    expect(bell).toMatch(/notificationsFailed/);
    expect(bell).toMatch(/<ReadFailed/);
  });
});
