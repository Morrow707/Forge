/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- HTTP statuses and byte signatures */
/**
 * "Import a program" through the real routes: who is let in, what a good file returns, what an
 * unreadable one says, and that the import itself writes nothing. The model is a fake (there is
 * no AI key in the test environment); server/program-import.test.ts covers the reading and the
 * matching, this file covers the doors.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { db, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { setProgramImportModelForTests } from "./program-import";
import { exercises, programs } from "@shared/schema";

const XLSX = readFileSync(path.join(__dirname, "__fixtures__", "program-import", "libreoffice-program.xlsx"));

async function upload(baseUrl: string, cookie: string, route: string, body: Buffer, name: string, type: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(body)], { type }), name);
  const res = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { cookie }, body: form });
  const text = await res.text();
  let json: any = null; // eslint-disable-line ts-patterns/no-explicit-any -- response bodies are asserted field by field
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function cookieFor(baseUrl: string, email: string) {
  return (await loginAs(baseUrl, { email })).cookieHeader();
}

describe("importing a program", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    setProgramImportModelForTests(async (_source, names) => ({
      name: "Week 1",
      days: [
        {
          label: "Day 1 - Lower",
          order: 1,
          exercises: [
            { nameAsWritten: "Back Squat", sets: 5, reps: "5", percent1RM: 75 },
            { nameAsWritten: "Bulgrian Split Squat", sets: 3, reps: "8 each", libraryName: names.includes("Bulgarian Split Squat") ? "Bulgarian Split Squat" : null },
          ],
        },
      ],
    }));
  });
  afterEach(() => setProgramImportModelForTests(null));

  it("a coach on a plan gets a draft: a matched row and a flagged one, and nothing is written", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    await makeExercise(coach.id, { name: "Back Squat" });
    await makeExercise(coach.id, { name: "Bulgarian Split Squat" });
    const [programsBefore] = await db.select({ n: count() }).from(programs);
    const [exercisesBefore] = await db.select({ n: count() }).from(exercises);

    const res = await upload(server.baseUrl, await cookieFor(server.baseUrl, coach.email), "/api/coach/programs/import-draft", XLSX, "week.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Week 1");
    const rows = res.body.days[0].exercises;
    expect(rows[0]).toMatchObject({ nameAsWritten: "Back Squat", match: { status: "matched", exercise: { name: "Back Squat" } }, weight: "75% 1RM" });
    expect(rows[1].match.status).toBe("flagged");
    expect(rows[1].match.suggestions[0].name).toBe("Bulgarian Split Squat");
    expect(res.body.flaggedCount).toBe(1);

    const [programsAfter] = await db.select({ n: count() }).from(programs);
    const [exercisesAfter] = await db.select({ n: count() }).from(exercises);
    expect(programsAfter.n).toBe(programsBefore.n);
    expect(exercisesAfter.n).toBe(exercisesBefore.n);
  });

  it("an unreadable file gets a sentence, not a crash", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const res = await upload(server.baseUrl, await cookieFor(server.baseUrl, coach.email), "/api/coach/programs/import-draft",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), "old.xls", "application/vnd.ms-excel");
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/older Excel file \(\.xls\)/);
  });

  it("no file at all is a sentence", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const res = await fetch(`${server.baseUrl}/api/coach/programs/import-draft`, {
      method: "POST",
      headers: { cookie: await cookieFor(server.baseUrl, coach.email) },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Choose a file/);
  });

  it("a coach whose plan is not active is refused the way every coach AI route refuses", async () => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    const res = await upload(server.baseUrl, await cookieFor(server.baseUrl, coach.email), "/api/coach/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(res.status).toBe(403);
    expect(res.body.coachPlanInactive).toBe(true);
  });

  it("a coached athlete is refused: their coach builds their program", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    const res = await upload(server.baseUrl, await cookieFor(server.baseUrl, athlete.email), "/api/athlete/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(res.status).toBe(403);
  });

  it("a Free Agent on Basic meets the AI paywall; on AI Coach they get a draft", async () => {
    const basic = await makeLoginableUser({ role: "athlete", isBetaAccount: false, freeAgentTier: "basic" });
    const refused = await upload(server.baseUrl, await cookieFor(server.baseUrl, basic.email), "/api/athlete/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(refused.status).toBe(402);
    expect(refused.body.freeAgentPaywall).toBe(true);

    const paid = await makeLoginableUser({ role: "athlete", isBetaAccount: false, freeAgentTier: "ai_coach" });
    const ok = await upload(server.baseUrl, await cookieFor(server.baseUrl, paid.email), "/api/athlete/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(ok.status).toBe(200);
    expect(ok.body.days[0].exercises).toHaveLength(2);
  });

  it("a coach cannot use the Free Agent route, and nobody signed out reaches either", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const asCoach = await upload(server.baseUrl, await cookieFor(server.baseUrl, coach.email), "/api/athlete/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(asCoach.status).toBe(403);
    const signedOut = await upload(server.baseUrl, "", "/api/coach/programs/import-draft", XLSX, "week.xlsx", "application/octet-stream");
    expect(signedOut.status).toBe(401);
  });
});
