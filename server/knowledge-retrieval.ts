import type { Pool } from "pg";

/**
 * Finding the passages that answer a question, from books ingested into the
 * knowledge base.
 *
 * WHY FULL-TEXT SEARCH RATHER THAN EMBEDDINGS
 *
 * The obvious build is vector similarity, and it was the plan. Two things
 * about this codebase pushed the other way, and both are worth writing down
 * because "why is there no vector index here" is the first question anyone
 * will have.
 *
 * The first is the standing rule that the AI stays in house. Every practical
 * embedding option either sends passages to a third-party API, which is
 * exactly the outbound branch that was deliberately removed, or downloads a
 * model at boot -- which is still an outbound fetch, on a 512MB instance,
 * for a corpus that today is measured in thousands of passages rather than
 * millions.
 *
 * The second is that this corpus is unusually well suited to lexical search.
 * Coaching material is dense with specific terminology -- hamstring, eccentric,
 * ACWR, velocity loss, ACL -- and a coach asking about hamstring strain uses
 * the word "hamstring". Postgres full-text search handles stemming and
 * ranking natively, is exact where it matters, needs no new dependency, and
 * cannot be wrong in the confident way a poorly-fitted embedding is.
 *
 * What lexical search genuinely loses is the paraphrase case: "posterior
 * chain" will not find a passage that only says "hamstring". That gap is
 * closed at the caller, by having the AI expand a question into related terms
 * before searching, which uses the model call already being made rather than
 * adding a new one.
 *
 * If the corpus grows to where this stops being good enough, the replacement
 * is a local embedding model and a vector column, and nothing else here has
 * to change: callers ask for passages and get passages.
 *
 * WHAT THE DOMAIN FILTER MATCHES AGAINST
 *
 * The PASSAGE's topics where it has them, the source's domains where it
 * does not. Filtering on the source alone forced an impossible choice on
 * any book covering more than one subject -- see server/passage-tagging.ts
 * for why a strength textbook's nutrition chapter is the case that breaks
 * it. The fallback keeps every passage ingested before tagging existed
 * exactly as findable as it was.
 */

export type RetrievedPassage = {
  passageId: number;
  sourceId: number;
  sourceTitle: string;
  citation: string | null;
  pageNumber: number;
  endPageNumber: number;
  text: string;
  fromVision: boolean;
  rank: number;
};

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  return fn(pool);
}

/**
 * Passages matching `query`, restricted to sources tagged with any of
 * `domains`.
 *
 * The domain filter is what keeps the assistants separate while sharing one
 * store: the nutrition AI never retrieves bar-path thresholds, and the class
 * AI building a nutrition course reads the nutrition domain deliberately
 * rather than by accident.
 *
 * websearch_to_tsquery rather than plain_to_tsquery, so an admin can use
 * quoted phrases and negation the way they would in any search box, and a
 * malformed query returns nothing instead of raising.
 */
export async function searchKnowledgePassages(input: {
  query: string;
  domains: string[];
  limit?: number;
}): Promise<RetrievedPassage[]> {
  const query = input.query.trim();
  if (!query || input.domains.length === 0) return [];
  const limit = Math.min(input.limit ?? 12, 50);

  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT p.id            AS passage_id,
              s.id            AS source_id,
              s.title         AS source_title,
              s.citation      AS citation,
              p.page_number,
              p.end_page_number,
              p.text,
              p.from_vision,
              ts_rank(p.search_vector, websearch_to_tsquery('english', $1)) AS rank
         FROM knowledge_passages p
         JOIN knowledge_sources s ON s.id = p.source_id
        WHERE p.search_vector @@ websearch_to_tsquery('english', $1)
          -- The passage's own topics decide, and the source's domains are
          -- the fallback for passages ingested before tagging existed.
          -- Without the fallback every one of those would vanish from every
          -- assistant the moment this shipped.
          AND (CASE WHEN cardinality(p.topics) > 0
                    THEN p.topics && $2::text[]
                    ELSE s.domains && $2::text[]
               END)
        ORDER BY rank DESC, p.id ASC
        LIMIT $3`,
      [query, input.domains, limit],
    ),
  );

  return rows.map((r) => ({
    passageId: r.passage_id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    citation: r.citation,
    pageNumber: r.page_number,
    endPageNumber: r.end_page_number,
    text: r.text,
    fromVision: r.from_vision,
    rank: Number(r.rank),
  }));
}

/**
 * The passages most similar to one given passage, for contradiction checking.
 *
 * Compares against its own text rather than a question, and excludes the
 * passage itself and everything from its own source: a book restating its own
 * point across two pages is not a contradiction, and treating it as one would
 * bury the real conflicts under hundreds of self-matches.
 */
export async function findSimilarPassages(input: {
  passageId: number;
  text: string;
  domains: string[];
  limit?: number;
}): Promise<RetrievedPassage[]> {
  const limit = Math.min(input.limit ?? 5, 20);
  // The passage's own text is the query, reduced to its distinctive words:
  // short words carry no signal and long passages make an unwieldy tsquery.
  //
  // Joined with OR, not AND. plainto_tsquery ANDs every term, so forty words
  // from one paragraph would require a match to contain all forty and nothing
  // would ever be returned -- which is exactly what it did before a test
  // caught it. What is wanted here is "shares a lot of vocabulary with this
  // passage", and ts_rank does the rest by scoring the ones that overlap most.
  const terms = [
    ...new Set(
      input.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4),
    ),
  ].slice(0, 40);
  if (terms.length === 0 || input.domains.length === 0) return [];
  const tsquery = terms.join(" | ");

  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT p.id AS passage_id, s.id AS source_id, s.title AS source_title, s.citation,
              p.page_number, p.end_page_number, p.text, p.from_vision,
              ts_rank(p.search_vector, to_tsquery('english', $1)) AS rank
         FROM knowledge_passages p
         JOIN knowledge_sources s ON s.id = p.source_id
        WHERE p.search_vector @@ to_tsquery('english', $1)
          AND p.id <> $2
          AND p.source_id <> (SELECT source_id FROM knowledge_passages WHERE id = $2)
          AND (CASE WHEN cardinality(p.topics) > 0
                    THEN p.topics && $3::text[]
                    ELSE s.domains && $3::text[]
               END)
        ORDER BY rank DESC
        LIMIT $4`,
      [tsquery, input.passageId, input.domains, limit],
    ),
  );

  return rows.map((r) => ({
    passageId: r.passage_id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    citation: r.citation,
    pageNumber: r.page_number,
    endPageNumber: r.end_page_number,
    text: r.text,
    fromVision: r.from_vision,
    rank: Number(r.rank),
  }));
}

/**
 * Renders retrieved passages for a prompt, with their citations attached.
 *
 * The citation is not decoration. Retrieved material sits BELOW the house
 * rules in precedence -- an admin's own taught guidance wins over a textbook
 * -- and a reader can only check that if the passage says where it came from.
 * The ordering statement is in the text rather than implied, because a
 * well-written textbook paragraph will otherwise out-argue a one-line rule
 * the admin wrote themselves.
 */
export function renderPassagesForPrompt(passages: RetrievedPassage[]): string {
  if (passages.length === 0) return "";
  const lines = passages.map((p) => {
    const where =
      p.pageNumber === p.endPageNumber
        ? `p. ${p.pageNumber}`
        : `pp. ${p.pageNumber}-${p.endPageNumber}`;
    const source = p.citation || p.sourceTitle;
    const caveat = p.fromVision ? " [transcribed from an image; verify numbers]" : "";
    return `[${source}, ${where}]${caveat}\n${p.text}`;
  });

  return [
    "Reference material retrieved from sources uploaded to this platform.",
    "These are reference, not house rules: anything taught directly in Forge",
    "outranks them, and where they disagree with each other, say so rather",
    "than picking one silently. Cite the source and page for any claim you",
    "take from here.",
    "",
    lines.join("\n\n"),
  ].join("\n");
}
