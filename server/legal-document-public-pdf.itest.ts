import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { extractPdf } from "./pdf-extract";
import { resetDatabase } from "./test-support/fixtures";
import { startTestServer, type TestServer } from "./test-support/http-app";
import { SIGNUP_AGREEMENT } from "./seed-data/signup-agreement";
import { PRIVACY_POLICY_DRAFT } from "./seed-data/legal-documents-draft";

/** A DOCUMENT ANYBODY CAN READ IS A DOCUMENT ANYBODY CAN KEEP.
 *
 * The PDF builder existed and only an admin route called it, so an athlete who accepted the
 * privacy policy could read it at /privacy and had no way to download it. The public route serves
 * the same public set as the text route, unauthenticated, and titles nothing "(Draft)".
 */
describe("GET /api/legal-documents/:type.pdf", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await storage.updateLegalAgreement(SIGNUP_AGREEMENT);
    await storage.updateLegalDocument("privacy_policy", PRIVACY_POLICY_DRAFT);
  });

  const get = (path: string) => fetch(`${server.baseUrl}${path}`);

  it("serves the privacy policy as a PDF to somebody with no session", async () => {
    const res = await get("/api/legal-documents/privacy_policy.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const text = (await extractPdf(Buffer.from(await res.arrayBuffer()))).pages
      .map((p) => p.text)
      .join("\n");
    expect(text).toContain("Privacy Policy");
    expect(text).not.toContain("(Draft)");
  });

  it("serves the Terms as the signup agreement, the way /terms does", async () => {
    const res = await get("/api/legal-documents/terms_of_service.pdf");
    expect(res.status).toBe(200);
    const text = (await extractPdf(Buffer.from(await res.arrayBuffer()))).pages
      .map((p) => p.text)
      .join("\n");
    // The first heading of the signup agreement, reflowed by the extractor.
    expect(text.replace(/\s+/g, " ")).toContain(
      SIGNUP_AGREEMENT.slice(0, 40).replace(/\s+/g, " "),
    );
  });

  it("does not expose a document that is not public", async () => {
    // The parental notice is delivered by email to a guardian; it has no public page and gets
    // no public PDF either.
    expect((await get("/api/legal-documents/parental_notice.pdf")).status).toBe(404);
    expect((await get("/api/legal-documents/nonsense.pdf")).status).toBe(404);
  });

  it("leaves the text route answering for the same type", async () => {
    const res = await get("/api/legal-documents/privacy_policy");
    expect(res.status).toBe(200);
    expect((await res.json()).content).toBe(PRIVACY_POLICY_DRAFT);
  });
});
