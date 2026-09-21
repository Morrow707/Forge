import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const routesSrc = readFileSync("server/routes.ts", "utf8");

/**
 * THE ONE UNAUTHENTICATED ROUTE THAT TOUCHES THE FILESYSTEM.
 *
 * `/api/review-exports/:token` is deliberately open -- the audience for a burned-in review is
 * a parent or a recruiter with no Forge account, and the token is the credential (Phase 5 of
 * docs/video-review-plan.md, and its entry in cross-tenant-scoping's GLOBAL_BY_DESIGN).
 *
 * That makes it the one place where "the token is unguessable" is not the whole answer. 32
 * random bytes are not brute-forceable, but an unbounded endpoint that does file work per
 * request is a denial-of-service surface whether or not any guess ever lands -- and every
 * other route in this app is bounded by a session before it reaches a disk.
 *
 * A text scan rather than a live test because the limiter is middleware: what matters is that
 * it is MOUNTED on this route, and mounting order is exactly what a runtime assertion on one
 * request cannot see.
 */
/** The handler's CODE, with comments stripped -- this file's assertions are about what runs,
 * and the route's own comments name the things it deliberately does not do. */
function shareHandlerCode(): string {
  const start = routesSrc.indexOf('app.get("/api/review-exports/:token"');
  return routesSrc
    .slice(start, start + 1400)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the export share link is bounded", () => {
  it("carries a rate limiter", () => {
    const route = /app\.get\(\s*"\/api\/review-exports\/:token"\s*,\s*(\w+)/.exec(routesSrc);
    expect(route, "the share-link route moved or was renamed").not.toBeNull();
    // The next argument after the path must be the limiter, not the handler: middleware added
    // after the handler never runs.
    expect(route![1]).toBe("exportShareLimiter");
    expect(routesSrc).toContain("const exportShareLimiter = rateLimit({");
  });

  it("does not block the event loop to decide whether the file is there", () => {
    // existsSync on a request path stats the disk synchronously for every viewer, and it is a
    // race regardless: the retention sweep can take the file between the check and the send.
    // sendFile's own callback answers both.
    const handler = shareHandlerCode();
    expect(handler).not.toContain("existsSync");
    expect(handler).toContain("res.sendFile(filePath, (err)");
  });

  it("resolves the path through the shared containment guard", () => {
    // uploadedFileDiskPath applies the same traversal check every other file helper does. A
    // path joined ad hoc at this call site is one nobody re-checks.
    expect(shareHandlerCode()).toContain("uploadedFileDiskPath(row.videoUrl)");
  });
});
