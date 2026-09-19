import express from "express";
import cors from "cors";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRoutes } from "./routes";
import { verifyRequestOrigin } from "./csrf-protection";
import { NATIVE_APP_ORIGINS } from "./native-app-origins";
import { registerInstitutionalAgreementRoutes } from "./institutional-agreement-routes";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, type TestClient } from "./test-support/http-app";
import { extractPdf } from "./pdf-extract";

/** A SCHOOL'S OWN COPY, OUT OF THE APP.
 *
 * The signed-agreement itest next door covers what counts as on file. This one covers the other
 * half: getting the unsigned document into a coach's hands with their institution's details
 * already in it, which used to be Scott editing a markdown file by hand.
 *
 * The server is booted here rather than through startTestServer because
 * registerInstitutionalAgreementRoutes is wired into routes.ts separately; this mirrors
 * http-app.ts's boot exactly and then adds the one registration. Once routes.ts carries the call,
 * routes.ts's copy is registered first and handles every request -- the second registration is
 * unreachable and the assertions below are unchanged either way.
 */
async function startAgreementServer() {
  const app = express();
  app.use(cors({ origin: NATIVE_APP_ORIGINS, credentials: true }));
  app.use(verifyRequestOrigin(NATIVE_APP_ORIGINS));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: false }));
  const server: Server = await registerRoutes(app);
  registerInstitutionalAgreementRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

let server: Awaited<ReturnType<typeof startAgreementServer>>;

/** The one request in this file that needs its bytes intact. */
async function rawPost(client: TestClient, path: string, body: unknown) {
  return fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forge-device-id": client.deviceId,
      cookie: client.cookieHeader(),
    },
    body: JSON.stringify(body),
  });
}

const GOOD = {
  institutionName: "Ironwood Ridge High School",
  address: "2475 W Naranja Dr, Oro Valley, AZ 85742",
  signerName: "Dana Whitfield",
  signerTitle: "Athletic Director",
  noticeEmail: "ad@ironwood.example",
};

describe("downloading a filled-in Institutional Service Agreement", () => {
  beforeAll(async () => {
    server = await startAgreementServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  const orgCoach = () => makeLoginableUser({ role: "coach", billingTier: "org_60" as never });

  it("refuses a coach with no organisational plan", async () => {
    // Nothing to sign: there is no institution. A contract naming one would be worse than a
    // refusal, which is why this is asked of the server and not of the form being on screen.
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/institutional-agreement/download", GOOD);
    expect(res.status).toBe(403);
    expect(String(res.body.message)).toMatch(/organisational plan/i);
  });

  it("names the field that is wrong rather than refusing in general", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.post("/api/coach/institutional-agreement/download", {
      ...GOOD,
      institutionName: "   ",
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.institutionName?.[0]).toMatch(/legal name/i);
    expect(res.body.fieldErrors.address).toBeUndefined();
  });

  it("catches a bad email address", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.post("/api/coach/institutional-agreement/download", {
      ...GOOD,
      noticeEmail: "ad-at-ironwood",
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.noticeEmail?.[0]).toMatch(/email address/i);
  });

  it("returns a PDF carrying the school's own details", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    // A raw fetch rather than client.post: TestClient decodes every body as UTF-8 text, which is
    // lossless for JSON and destroys a PDF. It borrows the client's session and device id so this
    // is the same caller, byte-for-byte, as every other request in the file.
    const res = await rawPost(client, "/api/coach/institutional-agreement/download", GOOD);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(5000);

    // Read back through the same extractor the knowledge ingest uses. Asserting on the raw bytes
    // was the obvious thing and is wrong: pdfkit writes standard-font runs as hex strings, so a
    // grep for the school's name comes back empty on a document that displays it perfectly.
    const text = (await extractPdf(bytes)).pages.map((p) => p.text).join("\n");
    expect(text).toContain("Ironwood Ridge High School");
    expect(text).toContain("Dana Whitfield");
    expect(text).toContain("Athletic Director");
    expect(text).toContain("16. GENERAL");
    // And none of the review marks that live in the doc file reach a school.
    expect(text).not.toContain("FOR SCOTT");
    expect(text).not.toContain("FOR COUNSEL");
    expect(text).not.toContain("BLANK");
  });

  it("shows the coach what they are about to sign", async () => {
    const client = await loginAs(server.baseUrl, await orgCoach());
    const res = await client.get("/api/coach/institutional-agreement/preview");
    expect(res.status).toBe(200);
    expect(res.body.text).toContain("16. GENERAL");
    expect(res.body.forgeSignerName).toBeTruthy();
  });

  it("is not a coach route an athlete can reach", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/coach/institutional-agreement/download", GOOD);
    expect(res.status).toBe(403);
  });
});
