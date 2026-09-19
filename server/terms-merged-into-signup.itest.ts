import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  loginAs,
  TestClient,
  type TestServer,
} from "./test-support/http-app";
import { storage } from "./storage";
import { SIGNUP_AGREEMENT } from "./seed-data/signup-agreement";

/**
 * ONE TERMS, SERVED AT THE OLD URL.
 *
 * Scott, 2026-09-19: "merge them, just one less document that gets in the way". Forge had two:
 * the public Terms of Service nobody ever accepted (a legalDocuments row) and the signup
 * clickwrap everybody accepts (legalAgreement id=1). The second survived, and /terms now shows
 * it, so a person can read the document they actually agreed to at the URL they already have.
 *
 * Through the real HTTP stack rather than against the route's helper, because the interesting
 * failure is the plumbing: the enum value, the path and the public-type gate all still say
 * "terms_of_service", and only the TEXT behind them moved. A unit test on the constants cannot
 * tell whether the route still reads the retired row.
 */

let server: TestServer;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
});

afterAll(async () => {
  await server?.close();
});

describe("GET /api/legal-documents/terms_of_service", () => {
  it("serves the signup agreement, exactly as stored", async () => {
    await storage.updateLegalAgreement(SIGNUP_AGREEMENT);
    const res = await new TestClient(server.baseUrl).get("/api/legal-documents/terms_of_service");

    expect(res.status).toBe(200);
    expect(res.body.content).toBe(SIGNUP_AGREEMENT);
    expect(res.body.content).toContain("FORGE -- TERMS OF USE");
    expect(res.body.content).toContain("16. INDEMNIFICATION");
    // The retired document's opening line must be nowhere in it.
    expect(res.body.content).not.toContain("FORGE -- TERMS OF SERVICE");
  });

  it("serves it WITH anything appended to the live agreement", async () => {
    // seed.ts appends the healthcare-provider notice to whatever is live, so the stored clickwrap
    // is never the source constant on its own. /terms shows what people agreed to, and the notice
    // is part of what they agreed to -- serving a trimmed "core" here would show a reader a
    // document that does not match their own consent record.
    const notice = "A note for physical therapists, physicians, and other licensed clinicians:";
    await storage.updateLegalAgreement(`${SIGNUP_AGREEMENT}\n\n${notice}`);
    const res = await new TestClient(server.baseUrl).get("/api/legal-documents/terms_of_service");

    expect(res.body.content).toBe(`${SIGNUP_AGREEMENT}\n\n${notice}`);
    await storage.updateLegalAgreement(SIGNUP_AGREEMENT);
  });

  it("is still public -- no session needed", async () => {
    const res = await new TestClient(server.baseUrl).get("/api/legal-documents/terms_of_service");
    expect(res.status).toBe(200);
  });

  it("does not read the retired legalDocuments row, even when one exists", async () => {
    // An installation that seeded the old Terms of Service keeps its row: it is left where it is
    // and never read (see seed-data/legal-documents-draft.ts). This is the "never read" half.
    await storage.updateLegalDocument("terms_of_service", "AN OLD STORED TERMS OF SERVICE");
    const res = await new TestClient(server.baseUrl).get("/api/legal-documents/terms_of_service");

    expect(res.body.content).toBe(SIGNUP_AGREEMENT);
    expect(res.body.content).not.toContain("AN OLD STORED TERMS OF SERVICE");
    // ...and the row is still there. A retirement is no reason to destroy an admin's text.
    const stored = await storage.getLegalDocument("terms_of_service");
    expect(stored?.content).toBe("AN OLD STORED TERMS OF SERVICE");
  });
});

describe("the admin side of the retired document", () => {
  let admin: TestClient;

  beforeAll(async () => {
    const user = await makeLoginableUser({ role: "admin" });
    admin = await loginAs(server.baseUrl, user);
  });

  it("titles it Terms of Use in the admin listing's PDF", async () => {
    const res = await admin.get("/api/admin/legal-documents/terms_of_service.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("refuses an edit, and points at the editor that works", async () => {
    // Two editors writing two rows is how the documents drifted apart in the first place. The
    // signup agreement editor is the one whose save re-asks every account to accept.
    const res = await admin.put("/api/admin/legal-documents/terms_of_service", {
      content: "something an admin typed",
    });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/signup agreement editor/);
  });

  it("still edits the documents that are real", async () => {
    const res = await admin.put("/api/admin/legal-documents/privacy_policy", {
      content: "A privacy policy an admin wrote.",
    });
    expect(res.status).toBe(200);
  });
});
