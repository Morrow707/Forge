import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { coachStaff } from "@shared/schema";
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

/** ONE SCHOOL'S EXECUTED CONTRACT NEVER REACHES ANOTHER.
 *
 * Found 2026-10-24. `getAcceptedInstitutionalAgreementWaiver` resolved
 * `inArray(athleteId, getEffectiveCoachIds(coachId))` and took `orderBy(desc(createdAt)).limit(1)`
 * -- the most recently accepted agreement held by ANYONE on the staff. A coach carries their own
 * agreement onto a staff they join: `/api/coach/staff/join` refuses only a coach who already has
 * a staff of their own, so a head coach who signed School 1's agreement and then joined School 2's
 * staff put School 1's row inside School 2's effective ids, NEWER than School 2's own.
 *
 * WHAT THE WRONG PDF CARRIES, which is why this is not a cosmetic scoping slip: buildAgreementPdf's
 * `executed` branch prints the institution's name, its signer's name and title, their typed
 * signature and their IP ADDRESS on the face of the document, by design, "so the PDF stands on its
 * own if it is ever produced away from the database". So the wrong answer here is another
 * organisation's executed legal instrument plus its signer's personal data.
 *
 * WHY NOBODY SAW IT. Every status read is correctly scoped -- `getLatestInstitutionalAgreementSignature`
 * is `eq(coachUserId, coachId)`, and the staff branch of `getInstitutionalAgreementStatus` recurses
 * into the PRIMARY's -- so the card on /documents names the right signature in every case. Only the
 * download was unscoped, and nothing is logged. The one hint was the Content-Disposition filename.
 *
 * AND WHY THE EXISTING SUITE COULD NOT: `institutional-agreement-sign.itest.ts` creates its staff
 * coach with `makeLoginableUser` and signs only as the primary, so no staff coach in it has ever
 * carried a prior agreement of their own -- the single fact the leak needs. The fixture, not the
 * assertion, is what was missing.
 */
const SCHOOL_ONE = {
  institutionName: "Ironwood Ridge High School",
  address: "2475 W Naranja Dr, Oro Valley, AZ 85742",
  signerName: "Dana Whitfield",
  signerTitle: "Athletic Director",
  noticeEmail: "ad@ironwood.example",
  typedSignature: "Dana Whitfield",
  authorizedToBind: true as const,
  agreed: true as const,
};

const SCHOOL_TWO = {
  institutionName: "Cascade Valley Academy",
  address: "1180 Mill Creek Rd, Everett, WA 98208",
  signerName: "Priya Raghunathan",
  signerTitle: "Director of Athletics",
  noticeEmail: "athletics@cascadevalley.example",
  typedSignature: "Priya Raghunathan",
  authorizedToBind: true as const,
  agreed: true as const,
};

describe("one school's executed agreement never reaches another", () => {
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

  /** A head coach who owes the agreement: a stated headcount is what makes `required` true. */
  const headCoach = (name: string) =>
    makeLoginableUser({ role: "coach", name, billingTier: "org_60" as never });

  const rawGet = (client: TestClient, path: string) =>
    fetch(`${server.baseUrl}${path}`, {
      headers: { "x-forge-device-id": client.deviceId, cookie: client.cookieHeader() },
    });

  const pdfText = async (client: TestClient) => {
    const res = await rawGet(client, "/api/coach/institutional-agreement/signed.pdf");
    expect(res.status).toBe(200);
    const doc = await extractPdf(Buffer.from(await res.arrayBuffer()));
    return doc.pages.map((pg) => pg.text).join("\n");
  };

  /** School 2 signs FIRST, then the coach who already signed School 1 joins its staff -- so
   *  School 1's row is the newest on the staff and wins a `desc(createdAt)` pick. That ordering
   *  is the whole bug, so it is built explicitly rather than left to insertion luck. */
  async function twoSchoolsOneStaff() {
    const schoolTwoPrimary = await headCoach("Priya Primary");
    const twoClient = await loginAs(server.baseUrl, schoolTwoPrimary);
    expect(
      (await twoClient.post("/api/coach/institutional-agreement/sign", SCHOOL_TWO)).status,
    ).toBe(201);

    const movedCoach = await headCoach("Dana Moved");
    const movedClient = await loginAs(server.baseUrl, movedCoach);
    expect(
      (await movedClient.post("/api/coach/institutional-agreement/sign", SCHOOL_ONE)).status,
    ).toBe(201);

    // The real door: a coach with no staff of their own may join one by code.
    // Minted explicitly: makeLoginableUser does not generate one, which is exactly why the
    // existing suite inserts coachStaff rows by hand and so never exercised the join door that
    // makes this leak reachable.
    const code = await storage.regenerateStaffInviteCode(schoolTwoPrimary.id);
    const joined = await storage.joinCoachStaffByCode(movedCoach.id, code);
    expect(joined, "the staff join is the account state this whole test depends on").toBeTruthy();

    const ids = await storage.getEffectiveCoachIds(schoolTwoPrimary.id);
    expect(ids[0]).toBe(schoolTwoPrimary.id);
    expect(ids, "School 1's signer is now inside School 2's effective ids").toContain(movedCoach.id);

    return { schoolTwoPrimary, twoClient, movedCoach, movedClient };
  }

  it("the primary downloads THEIR OWN school's contract, not the newest on the staff", async () => {
    const { twoClient } = await twoSchoolsOneStaff();

    const text = await pdfText(twoClient);
    expect(text).toContain(SCHOOL_TWO.institutionName);
    expect(
      text,
      "School 2's primary coach was served School 1's executed contract -- another " +
        "organisation's legal instrument, with its signer's name, title, typed signature and IP " +
        "address printed on its face",
    ).not.toContain(SCHOOL_ONE.institutionName);
    expect(text).not.toContain(SCHOOL_ONE.signerName);
    expect(text).not.toContain(SCHOOL_ONE.noticeEmail);
  });

  it("and the joining coach reads their NEW school's, which is what their card already says", async () => {
    /* The reverse direction, wrong for the same reason: `getEffectiveCoachIds(moved)` is
     * [schoolTwo, moved], so a newest-wins pick returned their OWN old contract while the
     * /documents card -- which recurses into the primary's status -- showed School 2's. Card and
     * document disagreeing is the part a reader cannot detect. */
    const { movedClient } = await twoSchoolsOneStaff();

    const status = await movedClient.get("/api/coach/institutional-agreement");
    expect(status.body).toMatchObject({ onFile: true, primaryCoachName: "Priya Primary" });

    const text = await pdfText(movedClient);
    expect(text).toContain(SCHOOL_TWO.institutionName);
    expect(text).not.toContain(SCHOOL_ONE.institutionName);
  });

  it("the filename names the right school too -- it was the only hint anything was wrong", async () => {
    const { twoClient } = await twoSchoolsOneStaff();
    const res = await rawGet(twoClient, "/api/coach/institutional-agreement/signed.pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition.toLowerCase()).toContain("cascade");
    expect(disposition.toLowerCase()).not.toContain("ironwood");
  });

  it("an ordinary staff coach still reads the primary's agreement -- the narrowing took nothing", async () => {
    /* The patch-safety case. Narrowing a read is the hazard this repo names, so the thing the old
     * code was FOR is asserted: it is the staff's own contract and an assistant must still be
     * able to produce it without going back through the head coach. */
    const primary = await headCoach("Dana Primary");
    const assistant = await makeLoginableUser({ role: "coach", name: "Assistant" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: assistant.id });

    const primaryClient = await loginAs(server.baseUrl, primary);
    expect(
      (await primaryClient.post("/api/coach/institutional-agreement/sign", SCHOOL_ONE)).status,
    ).toBe(201);

    const text = await pdfText(await loginAs(server.baseUrl, assistant));
    expect(text).toContain(SCHOOL_ONE.institutionName);
  });

  it("a staff coach whose primary signed nothing gets a 404, which AGREES with their card", async () => {
    /* What the narrowing deliberately stops serving. Before it, this coach's card said "nothing
     * on file" (the staff branch reports the PRIMARY's onFile) while the button handed them their
     * own old contract. A 404 is the two halves finally agreeing. */
    const primary = await headCoach("Unsigned Primary");
    const movedCoach = await headCoach("Dana Moved");
    const movedClient = await loginAs(server.baseUrl, movedCoach);
    expect(
      (await movedClient.post("/api/coach/institutional-agreement/sign", SCHOOL_ONE)).status,
    ).toBe(201);
    expect(
      await storage.joinCoachStaffByCode(
        movedCoach.id,
        await storage.regenerateStaffInviteCode(primary.id),
      ),
    ).toBeTruthy();

    const status = await movedClient.get("/api/coach/institutional-agreement");
    expect(status.body).toMatchObject({ onFile: false });

    const res = await rawGet(movedClient, "/api/coach/institutional-agreement/signed.pdf");
    expect(res.status).toBe(404);
  });

  it("a solo head coach is untouched", async () => {
    const solo = await headCoach("Solo");
    const client = await loginAs(server.baseUrl, solo);
    expect((await client.post("/api/coach/institutional-agreement/sign", SCHOOL_ONE)).status).toBe(
      201,
    );
    expect(await pdfText(client)).toContain(SCHOOL_ONE.institutionName);
  });
});
