import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { externalWaivers } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";

/** THE INSTITUTIONAL AGREEMENT IS SIGNED, NOT CLICKED.
 *
 * It used to be a clickwrap: a banner asked an org's primary coach to accept a document whose own
 * first line told them not to treat it as a proposed or binding agreement, because it had never
 * been drafted -- only assembled from patterns in the consumer terms. The consent record that
 * produced evidenced nothing, and a school had been asked to agree to a page that disclaimed
 * itself.
 *
 * The real agreement is a two-party contract signed per customer. Forge records THAT it exists,
 * the same way it records a school's own participation waiver.
 */
async function orgCoach() {
  return makeLoginableUser({ role: "coach", billingTier: "org_60" as never });
}

describe("an organisation's signed Service Agreement", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it("is required of an org's primary coach and not on file until it is filed", async () => {
    const coach = await orgCoach();
    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.required).toBe(true);
    expect(status.onFile).toBe(false);
    expect(status.reviewPending).toBe(false);
  });

  it("is not asked of a coach with no organisational plan", async () => {
    // A row nobody can satisfy is worse than no row -- the same rule the document checklist
    // follows. An individual coach has no institution to have signed anything.
    const coach = await makeLoginableUser({ role: "coach" });
    expect((await storage.getInstitutionalAgreementStatus(coach.id)).required).toBe(false);
  });

  it("reports an upload waiting for review as its own state", async () => {
    // Distinct from "nothing on file": this coach has done their part. Showing them the same
    // banner as somebody who has sent nothing is how a person learns to ignore a banner.
    const coach = await orgCoach();
    await db.insert(externalWaivers).values({
      athleteId: coach.id,
      uploadedByUserId: coach.id,
      kind: "institutional_agreement",
      fileUrl: "/uploads/waivers/signed.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.reviewPending).toBe(true);
    expect(status.onFile).toBe(false);
  });

  it("counts only a reviewed document as on file", async () => {
    // A document nobody has opened might be the wrong one, or blank, or unsigned. "On file" has
    // to mean somebody confirmed it arrived and is legible -- which is what reviewStatus means
    // here, and why the column is never called `verified`.
    const coach = await orgCoach();
    await db.insert(externalWaivers).values({
      athleteId: coach.id,
      uploadedByUserId: coach.id,
      kind: "institutional_agreement",
      fileUrl: "/uploads/waivers/signed.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      reviewStatus: "accepted",
      signedOn: "2026-09-17",
    });
    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.onFile).toBe(true);
    expect(status.reviewPending).toBe(false);
    expect(status.signedAt?.toISOString().slice(0, 10)).toBe("2026-09-17");
  });

  it("no longer offers any way to accept it in the app", async () => {
    // The route is gone. A negotiated contract is not accepted by clicking a button in a training
    // app, and the one that used to be here wrote a record against text that disclaimed itself.
    const coach = await orgCoach();
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/institutional-agreement/accept", {});
    expect(res.status).toBe(404);
  });

  it("does not hand the old outline to the client any more", async () => {
    // The status route used to return documentText so the banner could render it in a dialog with
    // an Accept button. There is nothing to render: the agreement lives on paper.
    const coach = await orgCoach();
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.get("/api/coach/institutional-agreement");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("documentText");
    expect(res.body.required).toBe(true);
  });
});
