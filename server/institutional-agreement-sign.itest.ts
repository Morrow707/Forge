import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { coachStaff, consentRecords, externalWaivers } from "@shared/schema";
import { storage } from "./storage";
import { extractPdf } from "./pdf-extract";
import { testOutbox } from "./email";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestClient,
  type TestServer,
} from "./test-support/http-app";

/** SIGNING THE INSTITUTIONAL SERVICE AGREEMENT IN THE APP.
 *
 * The paper loop still works; this makes it optional. What is worth testing is not that a button
 * posts -- it is that the four things a signature has to be able to produce later actually land:
 * the accepted waiver row (so `onFile` is one fact whichever way it was signed), the evidence row,
 * the consent record carrying the whole text, and a PDF that says on its face who signed and when.
 */
const GOOD = {
  institutionName: "Ironwood Ridge High School",
  address: "2475 W Naranja Dr, Oro Valley, AZ 85742",
  signerName: "Dana Whitfield",
  signerTitle: "Athletic Director",
  noticeEmail: "ad@ironwood.example",
  typedSignature: "Dana Whitfield",
  authorizedToBind: true as const,
  agreed: true as const,
};

describe("signing the Institutional Service Agreement in the app", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    testOutbox.length = 0;
  });

  const orgCoach = (name = "Primary") =>
    makeLoginableUser({ role: "coach", name, billingTier: "org_60" as never });

  /** The PDF route needs its bytes intact; TestClient decodes every body as text. */
  const rawGet = (client: TestClient, path: string) =>
    fetch(`${server.baseUrl}${path}`, {
      headers: { "x-forge-device-id": client.deviceId, cookie: client.cookieHeader() },
    });

  it("refuses a coach with no organisational plan", async () => {
    const client = await loginAs(server.baseUrl, await makeLoginableUser({ role: "coach" }));
    const res = await client.post("/api/coach/institutional-agreement/sign", GOOD);
    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/organisational plan/i);
  });

  it("names the typed signature when it is not the signer's name", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.post("/api/coach/institutional-agreement/sign", {
      ...GOOD,
      typedSignature: "D. Whitfield",
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.typedSignature?.[0]).toMatch(/exactly as it appears/i);
  });

  it("accepts a signature that differs only in case and space", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.post("/api/coach/institutional-agreement/sign", {
      ...GOOD,
      typedSignature: "  dana whitfield ",
    });
    expect(res.status).toBe(201);
  });

  it("will not sign without the authority representation", async () => {
    const { authorizedToBind: _omitted, ...withoutAuthority } = GOOD;
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.post("/api/coach/institutional-agreement/sign", withoutAuthority);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.authorizedToBind?.[0]).toMatch(/authorized/i);
  });

  it("files the agreement, the evidence and the consent record", async () => {
    const coach = await orgCoach();
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/institutional-agreement/sign", GOOD);
    expect(res.status).toBe(201);
    expect(res.body.signerName).toBe("Dana Whitfield");
    expect(res.body.institutionName).toBe("Ironwood Ridge High School");
    expect(res.body.pdfUrl).toBe("/api/coach/institutional-agreement/signed.pdf");
    expect(new Date(res.body.signedAt).getTime()).toBeGreaterThan(0);

    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.required).toBe(true);
    expect(status.onFile).toBe(true);
    expect(status.reviewPending).toBe(false);
    expect(status.canSignInApp).toBe(false);
    expect(status.signature?.signerName).toBe("Dana Whitfield");
    expect(status.signature?.signerTitle).toBe("Athletic Director");
    expect(status.signature?.institutionName).toBe("Ironwood Ridge High School");

    // The waiver row is what everything downstream reads, and it has to say it was never in front
    // of a human -- accepted by the signing flow, not by a reviewer.
    const [waiver] = await db
      .select()
      .from(externalWaivers)
      .where(
        and(
          eq(externalWaivers.athleteId, coach.id),
          eq(externalWaivers.kind, "institutional_agreement"),
        ),
      )
      .orderBy(desc(externalWaivers.createdAt));
    expect(waiver.reviewStatus).toBe("accepted");
    expect(waiver.reviewSource).toBe("in_app_signature");
    expect(waiver.reviewNote).toBe("Signed electronically in the app");
    expect(waiver.reviewedByUserId).toBeNull();
    expect(waiver.mimeType).toBe("application/pdf");
    expect(waiver.issuingOrganization).toBe("Ironwood Ridge High School");

    const consents = await db
      .select()
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.userId, coach.id),
          eq(consentRecords.consentType, "institutional_agreement"),
        ),
      );
    expect(consents).toHaveLength(1);
    // The whole text, not a reference to it: the record has to stand on its own years later.
    expect(consents[0].documentText).toContain("16. GENERAL");
    expect(consents[0].documentText).toContain("Dana Whitfield");
    expect(consents[0].documentText).toContain("SIGNED ELECTRONICALLY IN FORGE");

    // Best-effort copy to the notice address (captured by sendEmail under vitest).
    expect(testOutbox.some((m) => m.to === "ad@ironwood.example")).toBe(true);
  });

  it("serves back a PDF that says who signed it", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    expect((await client.post("/api/coach/institutional-agreement/sign", GOOD)).status).toBe(201);

    const res = await rawGet(client, "/api/coach/institutional-agreement/signed.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const text = (await extractPdf(bytes)).pages.map((p) => p.text).join("\n");
    expect(text).toContain("Electronically signed");
    expect(text).toContain("Dana Whitfield");
    expect(text).toContain("Accepted by Forge Performance Systems LLC");
    // The blank-lines version's instruction to print and upload must not survive onto an executed
    // copy -- it would tell a school that has already signed to go and sign again.
    expect(text).not.toContain("Your agreement is not on file");
  });

  it("has nothing to serve before anything is signed", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.get("/api/coach/institutional-agreement/signed.pdf");
    expect(res.status).toBe(404);
  });

  it("says so rather than signing twice", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    expect((await client.post("/api/coach/institutional-agreement/sign", GOOD)).status).toBe(201);
    const again = await client.post("/api/coach/institutional-agreement/sign", GOOD);
    expect(again.status).toBe(409);
    expect(String(again.body.message)).toMatch(/already on file/i);
  });

  it("lets an assistant coach read the agreement but not sign one", async () => {
    const primary = await orgCoach();
    const staff = await makeLoginableUser({ role: "coach", name: "Assistant" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });

    const primaryClient = await loginAs(server.baseUrl, primary);
    expect((await primaryClient.post("/api/coach/institutional-agreement/sign", GOOD)).status).toBe(
      201,
    );

    const staffClient = await loginAs(server.baseUrl, staff);
    // It is the staff's own contract, so reading it does not go back through the primary coach.
    const pdf = await rawGet(staffClient, "/api/coach/institutional-agreement/signed.pdf");
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    // Signing is the primary coach's act: `required` is false for anyone else.
    const signed = await staffClient.post("/api/coach/institutional-agreement/sign", GOOD);
    expect(signed.status).toBe(403);
  });

  it("shows a staff coach the primary's signature, read-only", async () => {
    const primary = await orgCoach("Dana Primary");
    const staff = await makeLoginableUser({ role: "coach", name: "Assistant" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const staffClient = await loginAs(server.baseUrl, staff);

    // Nothing signed yet: the staff status is empty, so the page draws nothing for them.
    const before = await staffClient.get("/api/coach/institutional-agreement");
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      required: false,
      onFile: false,
      signature: null,
      canSignInApp: false,
      primaryCoachName: null,
    });

    const primaryClient = await loginAs(server.baseUrl, primary);
    expect((await primaryClient.post("/api/coach/institutional-agreement/sign", GOOD)).status).toBe(
      201,
    );

    // Signed: the staff status carries the primary's agreement and names the primary, and still
    // offers no way to sign it.
    const after = await staffClient.get("/api/coach/institutional-agreement");
    expect(after.body).toMatchObject({
      required: false,
      onFile: true,
      canSignInApp: false,
      reviewPending: false,
      primaryCoachName: "Dana Primary",
    });
    expect(after.body.signature).toMatchObject({
      signerName: "Dana Whitfield",
      signerTitle: "Athletic Director",
      institutionName: "Ironwood Ridge High School",
    });
    expect(new Date(after.body.signedAt).getTime()).toBeGreaterThan(0);
    expect((await staffClient.post("/api/coach/institutional-agreement/sign", GOOD)).status).toBe(403);
    expect(
      (await staffClient.post("/api/coach/institutional-agreement/download", GOOD)).status,
    ).toBe(403);
    // The primary's own status is untouched by the staff read.
    const own = await storage.getInstitutionalAgreementStatus(primary.id);
    expect(own.required).toBe(true);
    expect(own.primaryCoachName).toBeNull();
  });
});
