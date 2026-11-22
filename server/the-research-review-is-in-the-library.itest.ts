import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetDatabase, makeCoach, db } from "./test-support/fixtures";
import { knowledgePassages, knowledgeSources } from "@shared/schema";
import { seedResearchReview } from "./seed-research-review";
import { searchKnowledgePassages } from "./knowledge-retrieval";
import { RESEARCH_REVIEW_SOURCE_TITLE, RETURN_TO_TRAINING_CAVEAT, buildResearchReviewPassages } from "./research-review-passages";

/**
 * Forge's research review reaches the AI knowledge library (2026-11-22), on real Postgres:
 * the seed creates one licensed source with one passage per finding, a second run writes
 * nothing, and the assistants' own retrieval finds the passages a coach would ask about.
 */
const EVERY_ASSISTANT_SHELF = ["strength", "sport", "rehab", "nutrition"];

let ownerId: number;

beforeAll(async () => {
  await resetDatabase();
  ownerId = (await makeCoach()).id;
});

describe("seedResearchReview", () => {
  it("creates one licensed, ready source with every finding as a passage", async () => {
    const first = await seedResearchReview(ownerId);
    expect(first.action).toBe("created");
    const sources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.title, RESEARCH_REVIEW_SOURCE_TITLE));
    expect(sources).toHaveLength(1);
    expect(sources[0].derivedContentLicensed).toBe(true);
    expect(sources[0].licenceNote).toBe("Forge's own summary of published studies");
    expect(sources[0].status).toBe("ready");
    const rows = await db.select().from(knowledgePassages).where(eq(knowledgePassages.sourceId, sources[0].id));
    expect(rows).toHaveLength(buildResearchReviewPassages().length);
  });

  it("writes nothing on a second run", async () => {
    const before = await db.select({ id: knowledgePassages.id }).from(knowledgePassages);
    const second = await seedResearchReview(ownerId);
    expect(second.action).toBe("unchanged");
    const after = await db.select({ id: knowledgePassages.id }).from(knowledgePassages);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });

  it("rewrites the passages once when the stored text has drifted", async () => {
    await db.update(knowledgeSources).set({ fileHash: "forge-research-review:stale" }).where(eq(knowledgeSources.title, RESEARCH_REVIEW_SOURCE_TITLE));
    expect((await seedResearchReview(ownerId)).action).toBe("updated");
    expect((await seedResearchReview(ownerId)).action).toBe("unchanged");
    const sources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.title, RESEARCH_REVIEW_SOURCE_TITLE));
    expect(sources).toHaveLength(1);
    const rows = await db.select().from(knowledgePassages).where(eq(knowledgePassages.sourceId, sources[0].id));
    expect(rows).toHaveLength(buildResearchReviewPassages().length);
  });
});

describe("the assistants retrieve it", () => {
  it("finds ACL prevention for girls' soccer", async () => {
    const hits = await searchKnowledgePassages({ query: "ACL girls soccer", domains: EVERY_ASSISTANT_SHELF });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.sourceTitle === RESEARCH_REVIEW_SOURCE_TITLE)).toBe(true);
    expect(hits[0].text).toContain("Citations: PMID ");
  });

  it("finds the Nordic hamstring curl, including for a licensed-only reader", async () => {
    const hits = await searchKnowledgePassages({ query: "Nordic hamstring", domains: ["strength"], licensedOnly: true });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.text.toLowerCase().includes("nordic"))).toBe(true);
  });

  it("files return to training on the rehab shelf with its not-medical-advice line", async () => {
    const hits = await searchKnowledgePassages({ query: "return to training ACL reconstruction", domains: ["rehab"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.text.includes(RETURN_TO_TRAINING_CAVEAT))).toBe(true);
  });
});
