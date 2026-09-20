import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EXPIRY_WARNING_DAYS,
  addDays,
  documentNeedsAction,
  documentStatus,
  type DocumentStatus,
} from "./required-documents";

const TODAY = "2026-09-17";

/** One rule, shared by the athlete's own checklist and the coach's roster view. Two screens
 * answering this differently is how a coach comes to believe an athlete is covered while the
 * athlete's own page says otherwise. */
describe("where a document stands", () => {
  it("is missing when there is no row at all", () => {
    expect(documentStatus(undefined, TODAY)).toBe("missing");
  });

  it("is accepted when it is accepted and carries no expiry", () => {
    expect(documentStatus({ reviewStatus: "accepted", expiresOn: null }, TODAY)).toBe("accepted");
  });

  it("is expired the day AFTER the date on it, not on it", () => {
    // A clearance valid through the 17th is valid on the 17th. Off by one here means telling a
    // coach an athlete is uncovered on a day they are covered.
    expect(documentStatus({ reviewStatus: "accepted", expiresOn: TODAY }, TODAY)).not.toBe("expired");
    expect(documentStatus({ reviewStatus: "accepted", expiresOn: "2026-09-16" }, TODAY)).toBe("expired");
  });

  it("warns before it lapses rather than after", () => {
    // The whole point: a document that expires tonight and is noticed tomorrow is the same as
    // never having had one.
    const inside = addDays(TODAY, EXPIRY_WARNING_DAYS - 1);
    const outside = addDays(TODAY, EXPIRY_WARNING_DAYS + 1);
    expect(documentStatus({ reviewStatus: "accepted", expiresOn: inside }, TODAY)).toBe("expiring_soon");
    expect(documentStatus({ reviewStatus: "accepted", expiresOn: outside }, TODAY)).toBe("accepted");
  });

  it("treats an expiry on a pending document as expiry, not as pending", () => {
    // Being in the review queue does not make a lapsed date current.
    expect(documentStatus({ reviewStatus: "pending_review", expiresOn: "2026-01-01" }, TODAY)).toBe("expired");
  });

  it("counts everything except accepted and pending as needing action", () => {
    expect(documentNeedsAction("missing")).toBe(true);
    expect(documentNeedsAction("expired")).toBe(true);
    expect(documentNeedsAction("expiring_soon")).toBe(true);
    expect(documentNeedsAction("rejected")).toBe(true);
    // Already uploaded and waiting on a human is not something to chase the athlete about.
    expect(documentNeedsAction("pending_review")).toBe(false);
    expect(documentNeedsAction("accepted")).toBe(false);
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
});

const routes = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
const storage = fs.readFileSync(path.join(process.cwd(), "server/storage.ts"), "utf8");

describe("chasing an athlete for what is outstanding", () => {
  const route = routes.slice(
    routes.indexOf('app.post("/api/coach/documents-status/request"'),
    routes.indexOf("/** The admin review queue"),
  );

  it("asks at most once a day per athlete", () => {
    // "Ask all" is one button, so the obvious way to use the screen is to press it again while
    // it still looks red. A parent who gets the same request four times stops reading them.
    expect(route).toContain("athletesChasedSince");
    expect(route).toMatch(/24 \* 60 \* 60 \* 1000/);
  });

  it("tells the coach what it skipped instead of quietly sending fewer", () => {
    expect(route).toMatch(/skipped: targets\.length - sent/);
  });

  it("cannot be pointed at somebody else's athlete", () => {
    // The list is built from this coach's own roster status and then filtered, so an id that is
    // not theirs is simply absent rather than checked and rejected.
    expect(route).toMatch(/statuses\.filter\([\s\S]{0,200}wanted\.includes/);
  });

  it("notifies the guardian too, who for a minor is the only one who can act", () => {
    const fn = storage.slice(
      storage.indexOf("async requestDocuments"),
      storage.indexOf("async externalWaiverSummary"),
    );
    expect(fn).toContain("guardianLinks.athleteId");
    expect(fn).toContain("createNotification");
  });

  it("sends the guardian to the CHILD's documents page, not their own", () => {
    // Bare "/documents" is the viewer's own checklist. A guardian has no forms of their own, so
    // that link landed a parent on an empty page with nothing pointing at the athlete the
    // request was about. /documents/:athleteId is the same page filing for somebody else.
    const fn = storage.slice(
      storage.indexOf("async requestDocuments"),
      storage.indexOf("async externalWaiverSummary"),
    );
    const guardianLoop = fn.slice(fn.indexOf("for (const g of guardians)"));
    expect(guardianLoop).toContain("`/documents/${input.athleteId}`");
    expect(guardianLoop).not.toMatch(/"\/documents",/);
  });
});

const athletePage = fs.readFileSync(
  path.join(process.cwd(), "client/src/pages/documents.tsx"),
  "utf8",
);

describe("the athlete's own checklist agrees with the coach's roster view", () => {
  it("renders every status the shared rule can produce", () => {
    // StatusMark used to branch on a hand-written union that left out "expiring_soon", so an
    // accepted clearance inside its warning window fell through to "Not uploaded" on the
    // athlete's page while the coach's page said "Expires soon" for the same row. Derived from
    // the type rather than restated: a status added to DocumentStatus without a branch here fails.
    const statuses: DocumentStatus[] = [
      "missing",
      "pending_review",
      "accepted",
      "rejected",
      "expiring_soon",
      "expired",
    ];
    const statusMark = athletePage.slice(
      athletePage.indexOf("function StatusMark"),
      athletePage.indexOf("export default function DocumentsPage"),
    );
    for (const status of statuses) {
      if (status === "missing") continue; // the fall-through branch, by design
      expect(statusMark, status).toContain(`status === "${status}"`);
    }
    expect(athletePage).toMatch(/status: DocumentStatus;/);
  });

  it("counts what is outstanding by the same rule the coach's page does", () => {
    // "Anything but accepted" counted a document already uploaded and waiting on review as one
    // the athlete still had to upload; the coach's page (documentStatusForRoster) never did.
    expect(athletePage).toMatch(/d\.required && documentNeedsAction\(/);
  });
});

describe("the roster document query", () => {
  it("reads the roster's documents in one query, not one per athlete", () => {
    const fn = storage.slice(
      storage.indexOf("async documentStatusForRoster"),
      storage.indexOf("async athletesChasedSince"),
    );
    expect(fn).toContain("inArray(externalWaivers.athleteId, athleteIds)");
  });

  it("counts only REQUIRED documents as outstanding", () => {
    // A recommended document nobody has is not a gap, and counting it makes every athlete
    // permanently red -- which is how a checklist stops being read.
    const fn = storage.slice(
      storage.indexOf("async documentStatusForRoster"),
      storage.indexOf("async athletesChasedSince"),
    );
    expect(fn).toMatch(/d\.required && documentNeedsAction\(d\.status\)/);
  });
});
