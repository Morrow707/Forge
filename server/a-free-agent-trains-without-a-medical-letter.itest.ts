/**
 * 2026-11-17, the week 1.0 went live. Scott's coworker signed up as a Free Agent and could not
 * open a workout: the document gate wanted a physician's medical clearance. Scott: "free agents,
 * don't need a medical waiver ... that was more just a coaches could upload to see it was there
 * not necessarily a necessity."
 *
 * Driven through the real compliance route with enforcement ON (the integration config's
 * setting, and production's), because the wall only exists there.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, makeCoach } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

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

describe("the document wall and the medical clearance", () => {
  it("a brand-new Free Agent with nothing on file is not blocked from training", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.get("/api/account/document-compliance");
    expect(res.status).toBe(200);
    // The premise: this is the enforcing configuration, so "not blocked" is a real answer.
    expect(res.body.enforced).toBe(true);
    expect(res.body.complete).toBe(true);
    expect(res.body.missing).toEqual([]);
  });

  it("a rostered athlete is asked for the participation waiver and never for the medical clearance", async () => {
    const coach = await makeCoach();
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, dateOfBirth: "1990-01-01" });
    await addToRoster(coach.id, athlete.id);
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.get("/api/account/document-compliance");
    const kinds = res.body.missing.map((d: { kind: string }) => d.kind);
    expect(kinds).toEqual(["participation_waiver"]);
  });

  it("the medical clearance can still be filed by a Free Agent, so it is on file if they have one", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, dateOfBirth: "1990-01-01" });
    const client = await loginAs(server.baseUrl, athlete);
    const checklist = await client.get("/api/account/document-compliance");
    expect(checklist.status).toBe(200);
    const { uploadableKindsFor } = await import("@shared/required-documents");
    expect(uploadableKindsFor("athlete_free_agent")).toContain("medical_clearance");
  });
});
