import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import {
  createMediaRemovalRequestSchema,
  resolveMediaRemovalRequestSchema,
} from "@shared/schema";

const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");

// Four rules, in the words they were given in:
//   1. A minor can sign up but cannot use the app until a parent has too.
//   2. A guardian sees everything on the athlete's profile.
//   3. A guardian writes nothing -- no sets, no food, nothing.
//   4. A guardian can request a video be removed, never remove it.
describe("rule 1: a minor is blocked until a guardian is linked", () => {
  it("gates the whole app in one middleware, not per route", () => {
    // Ahead of every route, so the next athlete route added is covered by
    // construction. Five AI routes were missed the last time a rule had to
    // be remembered at each call site.
    const gateAt = routes.indexOf("isAthleteBlockedPendingGuardian(user.id)");
    const firstRoute = routes.indexOf('app.get("/api/');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(firstRoute);
  });

  it("never traps the athlete in an account they cannot leave or explain", () => {
    for (const allowed of [
      '"/api/auth/"',
      '"/api/account/guardian-link"',
      '"/api/account/guardian-invite/resend"',
      '"/api/account/delete"',
    ]) {
      expect(routes).toContain(allowed);
    }
  });

  it("fails closed when it cannot answer, not open", () => {
    const gate = routes.slice(routes.indexOf("const GUARDIAN_GATE_ALLOWED_PREFIXES"));
    const body = gate.slice(0, gate.indexOf("Apple's Shared Web Credentials"));
    expect(body).toContain("guardian gate check failed");
    expect(body).toContain("503");
  });

  it("blocks a known minor, and only a known minor", () => {
    // The gate's own predicate, stated as the three cases it has to get
    // right. An unknown date of birth is not a minor -- guessing would lock
    // out every account created before that column existed.
    const fn = storage.slice(storage.indexOf("async isAthleteBlockedPendingGuardian"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("if (!athlete?.dateOfBirth) return false;");
    expect(body).toContain('=== "tier3_adult_18plus") return false;');
    expect(body).toContain("getGuardianLinkForAthlete");
  });

  it("agrees with derivePrivacyTier about who is a minor", () => {
    const now = new Date("2026-09-05T00:00:00Z");
    // Turned 18 yesterday, and turns 18 tomorrow -- the boundary the gate
    // swings on.
    expect(derivePrivacyTier("2008-09-04", now)).toBe("tier3_adult_18plus");
    expect(derivePrivacyTier("2008-09-06", now)).toBe("tier2_teen_13_17");
    expect(derivePrivacyTier("2014-01-01", now)).toBe("tier1_under13");
  });

  it("lets a blocked athlete nudge the parent without redirecting the invite", () => {
    const fn = auth.slice(auth.indexOf('"/api/account/guardian-invite/resend"'));
    const body = fn.slice(0, fn.indexOf("function issueGuardianInviteIfNeeded"));
    // The address comes from the existing invite, never from the request
    // body -- otherwise a minor nominates their own guardian.
    expect(body).toContain("getLastGuardianInviteEmail");
    expect(body).not.toContain("req.body");
  });

  it("does not let a guardian abandon a minor and lock them out", () => {
    const fn = storage.slice(storage.indexOf("async removeGuardianLink"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    const guardianBranch = body.slice(body.indexOf('requesterRole === "guardian"'));
    expect(guardianBranch).toContain("tier3_adult_18plus");
  });
});

describe("rule 2: a guardian can see the athlete's record", () => {
  const expected = [
    "/progress",
    "/goals",
    "/wellness/history",
    "/injury-history",
    "/nutrition",
    "/food-log",
    "/videos",
  ];
  for (const path of expected) {
    it(`exposes ${path}`, () => {
      expect(routes).toContain(`guardianRead("${path}"`);
    });
  }

  it("authorization-checks every one of them the same way", () => {
    const helper = routes.slice(routes.indexOf("function guardianRead("));
    const body = helper.slice(0, helper.indexOf("\n  }\n"));
    expect(body).toContain("getAthleteForGuardianScoped");
    // A link that isn't theirs reads as not-found, same as a coach hitting
    // another coach's athlete.
    expect(body).toContain("404");
    // Reads only. A write helper here would be the rule-3 violation.
    expect(body).toContain("app.get(");
    expect(body).not.toContain("app.post(");
  });
});

describe("rule 3: a guardian writes nothing on the athlete's record", () => {
  it("has no profile edit route", () => {
    expect(routes).not.toContain('app.patch("/api/guardian/athletes/:athleteId/profile"');
  });

  it("never hands a guardian the athlete's own profile schema", () => {
    const section = routes.slice(routes.indexOf("// ---------------- Guardian"));
    expect(section).not.toContain("updateProfileSchema");
  });

  it("leaves exactly three guardian writes, all deliberate", () => {
    // Camera tracking off, which is prospective and is the parental control the feature exists
    // for; asking for a removal, which somebody else answers; and signing off a research-consent
    // change the ATHLETE asked for.
    //
    // The third was added deliberately (Scott, 2026-09-10: if the athlete is underage they can
    // opt back in, but only with a guardian sign-off) and it is worth being explicit about why it
    // does not breach rule 3. Rule 3 is that a guardian cannot change or log information about
    // their child -- their training, their numbers, their record. Research consent is not
    // information about the child; it is a permission that is legally the guardian's to give in
    // the first place, and the app already recorded it, just laundered through a coach relaying
    // what a guardian said. A guardian answering directly is the same decision with one fewer
    // person in the middle.
    //
    // The shape still respects the rule: the guardian cannot ORIGINATE it. There is no route for
    // a guardian to set consent -- only to approve or decline something the athlete asked for.
    // Anything else appearing here is a regression.
    const guardianWrites = [...routes.matchAll(/app\.(post|patch|put|delete)\(\s*\n?\s*"\/api\/guardian\/[^"]*"/g)];
    const paths = guardianWrites.map((m) => m[0].split('"')[1]);
    expect(paths.sort()).toEqual([
      "/api/guardian/athletes/:athleteId/removal-requests",
      "/api/guardian/athletes/:athleteId/tracking-opt-out",
      "/api/guardian/research-consent-requests/:id",
    ]);
  });

  it("gives a guardian no way to originate a consent change", () => {
    // The ask is the athlete's and only the athlete's. A guardian route that SET consent, rather
    // than answering a request for it, would be the rule-3 breach this one is careful not to be.
    const section = routes.slice(routes.indexOf("// ---------------- Guardian"));
    expect(section).not.toContain('app.put("/api/guardian/athletes/:athleteId/research-consent"');
    expect(routes).toContain('"/api/athlete/research-consent/request"');
  });
});

describe("rule 4: request removal, never remove", () => {
  it("accepts a video reference and an optional reason, nothing else", () => {
    expect(createMediaRemovalRequestSchema.safeParse({ source: "set", sourceId: 4 }).success).toBe(true);
    expect(createMediaRemovalRequestSchema.safeParse({ source: "set", sourceId: 0 }).success).toBe(false);
    expect(createMediaRemovalRequestSchema.safeParse({ source: "nope", sourceId: 4 }).success).toBe(false);
  });

  it("only ever resolves to approved or denied", () => {
    expect(resolveMediaRemovalRequestSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(resolveMediaRemovalRequestSchema.safeParse({ status: "open" }).success).toBe(false);
  });

  it("verifies the video belongs to this athlete before filing anything", () => {
    // Without this a guardian could file against any video on the platform
    // and an admin working the queue would delete another child's footage.
    const post = routes.slice(routes.indexOf('"/api/guardian/athletes/:athleteId/removal-requests"'));
    const body = post.slice(0, post.indexOf("// ---------------- Admin"));
    expect(body).toContain("getVideosForAthlete(athlete.id)");
    expect(body).toContain("isn't on this athlete's record");
  });

  it("gives the guardian no delete path at all", () => {
    const section = routes.slice(routes.indexOf("// ---------------- Guardian"));
    const adminAt = section.indexOf("// ---------------- Admin");
    expect(section.slice(0, adminAt)).not.toContain("deleteAdminVideo");
  });

  it("actually deletes when an admin approves, through the one deletion path", () => {
    const fn = storage.slice(storage.indexOf("async resolveMediaRemovalRequest"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("this.deleteAdminVideo(");
    // Denying must not delete.
    const approveOnly = body.slice(body.indexOf('if (status === "approved")'));
    expect(approveOnly.indexOf("deleteAdminVideo")).toBeGreaterThan(-1);
    expect(body).toContain('request.status !== "open"');
  });

  it("resolving is admin-only", () => {
    const patch = routes.slice(routes.indexOf('app.patch("/api/admin/removal-requests/:id"'));
    expect(patch.slice(0, 200)).toContain('requireRole("admin")');
  });
});
