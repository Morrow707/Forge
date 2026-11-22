import { eq } from "drizzle-orm";
import { db } from "./db";
import { knowledgePassages, knowledgeSources } from "@shared/schema";
import {
  RESEARCH_REVIEW_CITATION,
  RESEARCH_REVIEW_DOMAINS,
  RESEARCH_REVIEW_LICENCE_NOTE,
  RESEARCH_REVIEW_SOURCE_TITLE,
  buildResearchReviewPassages,
  researchReviewContentHash,
} from "./research-review-passages";

/**
 * Writes Forge's research review into the knowledge library as one source and one passage per
 * finding (server/research-review-passages.ts builds them). Called from the seed on every
 * deploy and idempotent by the source's stable title:
 *
 * - no source with that title: create it, ready, licensed for derived content (it is Forge's
 *   own text), with every passage;
 * - a source whose file_hash equals the content hash of today's passages: write nothing;
 * - a source whose hash differs (the review was corrected): replace its passages and its hash
 *   in one transaction. Conflicts raised against the old passages cascade with them, which is
 *   right: they were about text that no longer exists.
 *
 * Writes through `db` directly rather than storage.ts, whose createKnowledgeSource cannot set
 * derived_content_licensed and whose file is single-owner.
 *
 * The passages are inserted in chunks, for the same reason createKnowledgeSource does: one
 * INSERT with hundreds of parameter sets exceeds what the driver will bind.
 */
const INSERT_BATCH = 200;

export type ResearchReviewSeedResult = { action: "created" | "updated" | "unchanged"; sourceId: number; passages: number };

export async function seedResearchReview(ownerUserId: number): Promise<ResearchReviewSeedResult> {
  const passages = buildResearchReviewPassages();
  const fileHash = researchReviewContentHash(passages);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: knowledgeSources.id, fileHash: knowledgeSources.fileHash })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.title, RESEARCH_REVIEW_SOURCE_TITLE))
      .limit(1);

    if (existing && existing.fileHash === fileHash) {
      return { action: "unchanged" as const, sourceId: existing.id, passages: passages.length };
    }

    const sourceFields = {
      citation: RESEARCH_REVIEW_CITATION,
      licenceNote: RESEARCH_REVIEW_LICENCE_NOTE,
      derivedContentLicensed: true,
      domains: RESEARCH_REVIEW_DOMAINS,
      fileHash,
      filePath: null,
      pageCount: passages.length,
      status: "ready" as const,
      statusDetail: null,
    };

    const sourceId = existing
      ? (await tx.update(knowledgeSources).set(sourceFields).where(eq(knowledgeSources.id, existing.id)).returning({ id: knowledgeSources.id }))[0].id
      : (await tx
          .insert(knowledgeSources)
          .values({ ...sourceFields, uploadedByUserId: ownerUserId, title: RESEARCH_REVIEW_SOURCE_TITLE })
          .returning({ id: knowledgeSources.id }))[0].id;

    if (existing) await tx.delete(knowledgePassages).where(eq(knowledgePassages.sourceId, sourceId));

    const rows = passages.map((p, ordinal) => ({
      sourceId,
      ordinal,
      pageNumber: p.pageNumber,
      endPageNumber: p.endPageNumber,
      text: p.text,
      fromVision: false,
      topics: p.topics,
    }));
    const batches = Array.from({ length: Math.ceil(rows.length / INSERT_BATCH) }, (_, i) => rows.slice(i * INSERT_BATCH, (i + 1) * INSERT_BATCH));
    await batches.reduce<Promise<unknown>>((prev, batch) => prev.then(() => tx.insert(knowledgePassages).values(batch)), Promise.resolve());

    return { action: existing ? ("updated" as const) : ("created" as const), sourceId, passages: passages.length };
  });
}
