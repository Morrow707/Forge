import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { knowledgeSources, knowledgePassages } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { searchKnowledgePassages } from "./knowledge-retrieval";

/** Counsel 2026-10-03 (docs/legal-open-questions.md, question 12): only a source Forge holds a
 * licence for may feed paid, Forge-written content. The licence switch, the retrieval gate
 * behind it, and a lesson's further reading surviving a save. */

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

async function seedSource(uploaderId: number, title: string, licensed: boolean) {
  const [src] = await db
    .insert(knowledgeSources)
    .values({
      uploadedByUserId: uploaderId,
      title,
      citation: `${title}, 1st ed.`,
      fileHash: `hash-${title}-${Math.random()}`,
      status: "ready",
      domains: ["strength"],
      derivedContentLicensed: licensed,
    })
    .returning();
  await db.insert(knowledgePassages).values({
    sourceId: src.id,
    ordinal: 1,
    pageNumber: 40,
    endPageNumber: 41,
    text: "Plyometric training uses the stretch shortening cycle to develop explosive power in athletes.",
    fromVision: false,
  });
  return src;
}

describe("the licence gate", () => {
  it("retrieval with licensedOnly sees only a licensed source", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    await seedSource(admin.id, "Bought Book", false);
    await seedSource(admin.id, "Forge Notes", true);
    const all = await searchKnowledgePassages({ query: "plyometric", domains: ["strength"] });
    const licensed = await searchKnowledgePassages({ query: "plyometric", domains: ["strength"], licensedOnly: true });
    expect(all.map((p) => p.sourceTitle).sort()).toEqual(["Bought Book", "Forge Notes"]);
    expect(licensed.map((p) => p.sourceTitle)).toEqual(["Forge Notes"]);
  });

  it("an admin cannot mark a source licensed without saying what the licence is", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const src = await seedSource(admin.id, "Bought Book", false);
    const client = await loginAs(server.baseUrl, admin);
    const refused = await client.patch(`/api/admin/knowledge-sources/${src.id}/licence`, { derivedContentLicensed: true });
    expect(refused.status).toBe(400);
    const ok = await client.patch(`/api/admin/knowledge-sources/${src.id}/licence`, {
      derivedContentLicensed: true,
      licenceNote: "Publisher's written permission, 2026-10-01",
    });
    expect(ok.status).toBe(200);
    const list = await client.get("/api/admin/knowledge-sources");
    expect(list.body.find((s: any) => s.id === src.id)).toMatchObject({
      derivedContentLicensed: true,
      licenceNote: "Publisher's written permission, 2026-10-01",
    });
  });

  it("the citation pass attaches further reading from licensed sources only", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    await seedSource(admin.id, "Bought Book", false);
    const client = await loginAs(server.baseUrl, admin);
    const none = await client.post("/api/admin/academy/suggest-sources", {
      lessons: [{ title: "Plyometrics", content: "Plyometric training and the stretch shortening cycle for explosive power." }],
      domains: ["strength"],
    });
    expect(none.status).toBe(200);
    expect(none.body.sources).toEqual([[]]);

    await seedSource(admin.id, "Forge Notes", true);
    const some = await client.post("/api/admin/academy/suggest-sources", {
      lessons: [{ title: "Plyometrics", content: "Plyometric training and the stretch shortening cycle for explosive power." }],
      domains: ["strength"],
    });
    expect(some.body.sources[0]).toHaveLength(1);
    expect(some.body.sources[0][0]).toMatchObject({ sourceTitle: "Forge Notes", pageStart: 40, pageEnd: 41 });
  });
});

describe("further reading on a lesson", () => {
  it("survives create, read-back and update, and reaches the coach", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const source = { sourceId: null, sourceTitle: "Forge Notes", citation: "Forge Notes, 1st ed.", pageStart: 40, pageEnd: 41 };
    const created = await ca.post("/api/admin/academy/tracks", {
      title: "Plyometrics",
      description: "Jumping, well.",
      keyPrinciplesForAi: "Land before you leap.",
      lessons: [{ lessonNumber: 1, title: "The cycle", content: "Own words here.", estMinutes: 4, sources: [source] }],
      quizQuestions: [],
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const read = await ca.get(`/api/admin/academy/tracks/${id}`);
    expect(read.body.lessons[0].sources).toEqual([source]);

    const lessonId = read.body.lessons[0].id;
    const updated = await ca.put(`/api/admin/academy/tracks/${id}`, {
      ...read.body,
      lessons: [{ ...read.body.lessons[0], id: lessonId, sources: [] }],
    });
    expect(updated.status).toBe(200);
    expect((await ca.get(`/api/admin/academy/tracks/${id}`)).body.lessons[0].sources).toEqual([]);

    await ca.put(`/api/admin/academy/tracks/${id}`, {
      ...read.body,
      lessons: [{ ...read.body.lessons[0], id: lessonId, sources: [source] }],
    });
    const cc = await loginAs(server.baseUrl, coach);
    const forCoach = await cc.get(`/api/coach/academy/tracks/${id}`);
    expect(forCoach.status).toBe(200);
    expect(forCoach.body.unlocked).toBe(true);
    expect(forCoach.body.lessons[0].sources).toEqual([source]);
  });
});
