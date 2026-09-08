import { askClaudeStructured, aiEnabled, fastModel } from "./ai";
import {
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_DOMAIN_KEYS,
  isKnowledgeDomain,
  UNFILED_TOPIC,
} from "@shared/knowledge-domains";
import type { Passage } from "./pdf-extract";

/**
 * Working out what each passage is actually about.
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * Domains started life on the source: you ticked which assistants a book
 * belonged to and that applied to the whole file. That works for a
 * single-subject book and breaks on the first real one anybody uploads. A
 * strength and conditioning textbook has a nutrition chapter in it. Tag the
 * source "strength" and the nutrition assistant can never see that chapter.
 * Tag it "strength, nutrition" and the nutrition assistant now searches
 * every page of bar-path and periodization material as well, and the
 * program builder searches the nutrition chapter.
 *
 * Neither is right, so the tag belongs on the passage.
 *
 * HOW IT IS DONE CHEAPLY
 *
 * A whole book is thousands of passages, and one model call each would cost
 * more than transcribing it. Two things keep it affordable:
 *
 *   - Passages are tagged in groups, many per call.
 *   - The cheap model does it. Deciding whether a paragraph is about protein
 *     or about bar speed is not a judgement call that repays a large model.
 *
 * The source's own domains bound the answer: a book nobody tagged
 * "nutrition" cannot produce nutrition passages. That stops one
 * misclassified paragraph from putting a strength textbook into the
 * nutrition assistant's reach, and it means the admin's own choice is still
 * the outer limit rather than a suggestion.
 *
 * When tagging fails or AI is off, passages fall back to the source's
 * domains, which is exactly the old behaviour. Retrieval reads the tags
 * where they exist and the source's domains where they do not, so nothing
 * ingested before this existed stops working.
 */

const GROUP_SIZE = 12;

export type TaggedPassage = Passage & { topics: string[] };

function buildTool(allowed: string[]) {
  return {
    name: "tag_passages",
    description: "Say which subject areas each numbered passage belongs to.",
    input_schema: {
      type: "object" as const,
      properties: {
        passages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer", description: "The passage's number as given." },
              topics: {
                type: "array",
                items: { type: "string", enum: allowed },
                description:
                  "Every area this passage genuinely belongs to, usually one. Empty if it belongs to none of them -- front matter, an index entry, a copyright notice.",
              },
            },
            required: ["index", "topics"],
          },
        },
      },
      required: ["passages"],
    },
  };
}

const SYSTEM = [
  "You file passages from a coaching or sports-science text into subject areas.",
  "",
  "Areas available:",
  ...KNOWLEDGE_DOMAINS.map((d) => `- ${d.key}: ${d.label}`),
  "",
  "Rules:",
  "- File a passage by what it is ABOUT, not by what book it came from. A",
  "  nutrition chapter inside a strength textbook is nutrition.",
  "- Most passages belong to exactly one area. Use two only when the passage",
  "  genuinely serves both, e.g. fuelling around a rehab session.",
  "- Return an empty list for anything that is not subject matter at all:",
  "  a table of contents, an index entry, a copyright page, a chapter",
  "  heading on its own, a list of references.",
  "- Only use areas from the list you are given for this book. If a passage",
  "  is about something outside that list, return an empty list rather than",
  "  forcing it into the nearest one.",
].join("\n");

/**
 * Tags passages in place, returning them with a `topics` array.
 *
 * Never throws and never returns fewer passages than it was given: a failed
 * group falls back to the source's own domains rather than losing the
 * passages, because an untagged passage is still worth having and a missing
 * one is not.
 */
export async function tagPassages(
  passages: Passage[],
  sourceDomains: string[],
): Promise<TaggedPassage[]> {
  const allowed = sourceDomains.filter(isKnowledgeDomain);
  // Nothing to choose between, or no AI: the source's own domains are the
  // answer, which is what every passage got before this existed.
  if (!aiEnabled || allowed.length === 0 || passages.length === 0) {
    return passages.map((p) => ({ ...p, topics: allowed }));
  }
  if (allowed.length === 1) {
    // One domain on the book means the tagger has no decision to make, and
    // paying a model to confirm it would be pure waste.
    return passages.map((p) => ({ ...p, topics: allowed }));
  }

  const tool = buildTool(allowed);
  const out: TaggedPassage[] = [];

  for (let i = 0; i < passages.length; i += GROUP_SIZE) {
    const group = passages.slice(i, i + GROUP_SIZE);
    const prompt = group
      .map(
        (p, j) =>
          `Passage ${j} (p. ${p.pageNumber}):\n${p.text.slice(0, 1500)}`,
      )
      .join("\n\n");

    const result = await askClaudeStructured<{ passages?: { index: number; topics: string[] }[] }>(
      SYSTEM,
      `This book was filed under: ${allowed.join(", ")}.\n\n${prompt}`,
      tool,
      { maxTokens: 1000, model: fastModel, feature: "passage-tagging" },
    );

    const byIndex = new Map<number, string[]>();
    for (const row of result?.passages ?? []) {
      if (typeof row?.index !== "number") continue;
      const topics = (Array.isArray(row.topics) ? row.topics : [])
        .filter((t): t is string => typeof t === "string")
        .filter(isKnowledgeDomain)
        // The source's domains are the ceiling, not a hint.
        .filter((t) => allowed.includes(t));
      // An empty verdict is the tagger saying "this is not subject matter".
      // Stored as the sentinel rather than as [], because [] means "never
      // tagged" downstream and falls back to the source's domains -- which
      // would publish index entries and copyright pages to every assistant.
      byIndex.set(row.index, topics.length > 0 ? [...new Set(topics)] : [UNFILED_TOPIC]);
    }

    group.forEach((p, j) => {
      // A group the model did not answer for falls back to the source's
      // domains, so it behaves exactly as it would have before tagging
      // existed rather than becoming unfindable.
      out.push({ ...p, topics: byIndex.get(j) ?? allowed });
    });
  }

  return out;
}

export { KNOWLEDGE_DOMAIN_KEYS };
