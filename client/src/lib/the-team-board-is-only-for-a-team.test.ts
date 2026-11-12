import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* NOBODY CONTACTS ANYBODY UNLESS THEY ARE ON A TEAM, AND IT IS ALWAYS PUBLIC (Scott, 2026-11-12).
 * The Team Board is the one place athletes write to other people, so it holds both halves:
 * - every athlete board route resolves the board from the athlete's OWN active coach and refuses
 *   when there is none (a Free Agent, or a parked off-season athlete);
 * - no route lets the caller name a board, a recipient or a thread, so a post can only ever land
 *   on the shared board the whole program reads;
 * - the athlete page draws nothing of the board until it knows the athlete is on a team. */

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const EVEN = 2;

/** Block comments that open a line, then `//` comments with balanced quotes before them. */
function stripComments(src: string): string {
  // A block comment starting its line: "  /* text */" yes; 'x = "/*"' no.
  // https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&testString=%20%20%2F*%20text%20*%2F
  const noBlocks = src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
  return noBlocks
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at === -1) return line;
      const before = line.slice(0, at);
      // Quote characters: '"', "'" and "`" yes; letters no.
      // https://regex101.com/?regex=%5B%22'%60%5D&testString=%22a%22
      const quotes = (before.match(/["'`]/g) ?? []).length;
      return quotes % EVEN === 0 ? before : line;
    })
    .join("\n");
}

/** Each `app.<verb>("/api/athlete/team-board...")` handler, bounded by the next `app.<verb>(`. */
function athleteBoardRoutes(src: string): { route: string; body: string }[] {
  // An athlete board route: 'app.post("/api/athlete/team-board"' yes; '"/api/coach/team-board"' no.
  // https://regex101.com/?regex=app%5C.(get%7Cpost%7Cput%7Cpatch%7Cdelete)%5C(%22(%5C%2Fapi%5C%2Fathlete%5C%2Fteam-board%5B%5E%22%5D*)%22&testString=app.post(%22%2Fapi%2Fathlete%2Fteam-board%22
  const re = /app\.(get|post|put|patch|delete)\("(\/api\/athlete\/team-board[^"]*)"/g;
  return Array.from(src.matchAll(re)).map((m) => {
    const start = m.index ?? 0;
    // The next route registration of any kind: 'app.get(' yes; 'apply(' no.
    // https://regex101.com/?regex=app%5C.(get%7Cpost%7Cput%7Cpatch%7Cdelete%7Cuse)%5C(&testString=app.get(
    const next = src.slice(start + 1).search(/app\.(get|post|put|patch|delete|use)\(/);
    return { route: `${m[1].toUpperCase()} ${m[2]}`, body: src.slice(start, next === -1 ? src.length : start + 1 + next) };
  });
}

describe("the Team Board is only for a team, and only in the open", () => {
  const routes = stripComments(read("server/routes.ts"));
  const boards = athleteBoardRoutes(routes);

  it("finds the athlete board routes it is checking", () => {
    expect(boards.map((b) => b.route)).toEqual(
      expect.arrayContaining(["GET /api/athlete/team-board", "POST /api/athlete/team-board", "GET /api/athlete/team-board/unread"]),
    );
  });

  it("every read and write of a board resolves it from the athlete's own coach and stops without one", () => {
    boards
      .filter((b) => !b.route.endsWith("/read"))
      .forEach((b) => {
        expect(b.body, b.route).toContain("getCoachesForAthlete(user.id)");
        // A guard that returns when there is no coach: "if (!coach) return" yes.
        // https://regex101.com/?regex=if%20%5C(!coach%5C)%20return&testString=if%20(!coach)%20return%20res
        expect(b.body, b.route).toMatch(/if \(!coach\) return/);
      });
  });

  it("no board route lets the caller name a board, a recipient or a thread", () => {
    // The coach routes too, read through the same bounding: "/api/coach/team-board" yes; "/api/coach/teams" no.
    // https://regex101.com/?regex=%5C%2Fapi%5C%2Fcoach%5C%2Fteam-board&testString=%2Fapi%2Fcoach%2Fteam-board
    const coachBoards = athleteBoardRoutes(routes.replace(/\/api\/coach\/team-board/g, "/api/athlete/team-board"));
    [...boards, ...coachBoards].forEach((b) => {
      // A caller-chosen target: "req.params.coachId", "req.body.recipientId", "req.query.threadId" yes.
      // https://regex101.com/?regex=req%5C.(params%7Cbody%7Cquery)%5C.%5Cw*(coach%7Crecipient%7Cthread%7Cto%7Cuser)%5Cw*&testString=req.body.recipientId
      expect(b.body, b.route).not.toMatch(/req\.(params|body|query)\.\w*(coach|recipient|thread|to|user)\w*/i);
    });
  });

  it("the athlete page draws the board only once it knows the athlete is on a team", () => {
    const page = stripComments(read("client/src/pages/athlete/team-board.tsx"));
    expect(page).toContain("useIsFreeAgent()");
    // The early return guards every answer but a known "no": "if (isFreeAgent !== false)" yes.
    // https://regex101.com/?regex=if%20%5C(isFreeAgent%20!%3D%3D%20false%5C)&testString=if%20(isFreeAgent%20!%3D%3D%20false)
    const guard = page.search(/if \(isFreeAgent !== false\)/);
    const board = page.indexOf("<TeamBoard");
    expect(guard).toBeGreaterThan(-1);
    // The guarded branch ends with its own return before the board is drawn.
    const guarded = page.slice(guard, board);
    expect(guarded).toContain("return (");
    expect(guarded.lastIndexOf("}")).toBeGreaterThan(guarded.indexOf("return ("));
  });
});
