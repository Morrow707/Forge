import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE FILE IS KEPT FOREVER AND NOBODY CAN BROWSE IT.
//
// Those look contradictory and are not. A release nobody can produce covers nobody, so the
// document stays. And "we might need one of these some day" is not a reason to let anybody with
// the admin role read all of them today -- which is what a scrollable list of accepted documents
// is, whatever it is called.
//
// What reconciles them: producing a document is a deliberate act with a name on it. No list;
// name the athlete, name the document, say why; the grant opens it once and is spent. Asking
// again is allowed and is another logged row. The control is that an open is never silent, not
// that it is impossible.
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const adminPage = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "admin", "waivers.tsx"),
  "utf8",
);

describe("there is no way to scroll accepted documents", () => {
  it("the review queue is pending-only, with no widening parameter left to pass", () => {
    const fn = storage.slice(
      storage.indexOf("async listExternalWaiversForReview"),
      storage.indexOf("async findDecidedWaiversForAthlete"),
    );
    expect(fn).toContain('eq(externalWaivers.reviewStatus, "pending_review")');
    // The previous shapes, both gone: the ne(accepted) filter and the "all" escape hatch.
    expect(fn).not.toContain('status === "all"');
    // Scoped to this route -- another, unrelated queue still takes a status filter.
    const route = routes.slice(
      routes.indexOf('app.get("/api/admin/waivers", requireRole("admin")'),
      routes.indexOf('/api/admin/waivers/athlete/:athleteId'),
    );
    expect(route).not.toContain("req.query.status");
    expect(route).toContain("listExternalWaiversForReview()");
  });

  it("the per-athlete lookup returns metadata and never a file path", () => {
    const fn = storage.slice(
      storage.indexOf("async findDecidedWaiversForAthlete"),
      storage.indexOf("async grantExternalWaiverView"),
    );
    // hasFile says whether one exists; fileUrl itself is not selected.
    expect(fn).toContain("hasFile:");
    expect(fn).not.toMatch(/fileUrl: externalWaivers\.fileUrl/);
  });

  it("closes the other door -- the shared read route strips fileUrl for an admin", () => {
    // Taking the list out of the queue is cosmetic on its own: this route returns every waiver
    // row for an athlete, res.json signs any /uploads path on the way out, and an admin may call
    // it. Without this an admin browses one athlete at a time instead.
    expect(routes).toContain("AN ADMIN NEVER GETS A fileUrl FROM HERE");
    expect(routes).toMatch(/user\.role === "admin" && !\(await storage\.canManageWaiversFor/);
  });
});

describe("opening one", () => {
  it("requires a reason long enough to be a sentence", () => {
    const fn = storage.slice(
      storage.indexOf("async grantExternalWaiverView"),
      storage.indexOf("async consumeExternalWaiverViewGrant"),
    );
    expect(fn).toContain("if (reason.length < 8) return null;");
    expect(routes).toMatch(/z\.object\(\{ reason: z\.string\(\)\.min\(8\)/);
  });

  it("stores only a hash of the token, and expires it", () => {
    const fn = storage.slice(
      storage.indexOf("async grantExternalWaiverView"),
      storage.indexOf("async consumeExternalWaiverViewGrant"),
    );
    expect(fn).toContain('createHash("sha256").update(token)');
    expect(fn).toContain("expiresAt");
  });

  it("is spent by the same UPDATE that matches it, so a race cannot serve it twice", () => {
    const fn = storage.slice(
      storage.indexOf("async consumeExternalWaiverViewGrant"),
      storage.indexOf("async listExternalWaiverViewGrants"),
    );
    expect(fn).toMatch(/\.update\(externalWaiverViewGrants\)[\s\S]{0,120}usedAt: new Date\(\)/);
    expect(fn).toContain("isNull(externalWaiverViewGrants.usedAt)");
    expect(fn).toContain("gt(externalWaiverViewGrants.expiresAt, new Date())");
    // Bound to the admin who asked -- a leaked token is not a key for somebody else.
    expect(fn).toContain("eq(externalWaiverViewGrants.adminUserId, adminUserId)");
  });

  it("streams the bytes rather than handing out a signed media URL", () => {
    // A signed URL is shareable and reusable for its whole lifetime -- right for a coach
    // re-watching a form check, wrong for a child's signed medical record.
    const route = routes.slice(routes.indexOf('"/api/admin/waivers/view/:token"'));
    const body = route.slice(0, 1600);
    expect(body).toContain("res.sendFile");
    expect(body).toContain("no-store");
    expect(body).not.toContain("signMediaUrl");
    expect(body).toContain('rel.includes("..")');
  });

  it("tells the admin their reason is recorded, before they type it", () => {
    expect(adminPage).toMatch(/records who you are, when, and the reason you give/);
    expect(adminPage).toContain("Who has opened these");
  });
});
