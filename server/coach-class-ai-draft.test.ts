import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The coach's AI class drafter (2026-10-04) reads nothing but what the coach pasted. The
 * admin's drafter may name knowledge-library domains to draw on; the coach's never passes
 * them, because the library is not a source a coach's class may use
 * (docs/legal-open-questions.md, question 12). A scan, because the only way this breaks is
 * somebody copying the admin route's body over. */
const routes = readFileSync(resolve(__dirname, "routes.ts"), "utf8");

describe("the coach class drafter", () => {
  it("exists for a coach and passes no retrieval domains", () => {
    const start = routes.indexOf('app.post("/api/coach/classes/ai-draft"');
    expect(start).toBeGreaterThan(-1);
    const end = routes.indexOf("\n  });\n", start);
    const body = routes.slice(start, end);
    expect(body).toContain('requireRole("coach")');
    expect(body).not.toContain("retrievalDomains");
    expect(body).toMatch(/generateClassDraftFromDocument\([^)]*undefined, parsed\.data\.readingLevel\)/);
  });

  it("is offered on the coach's own classes page", () => {
    const page = readFileSync(resolve(__dirname, "../client/src/pages/coach/classes.tsx"), "utf8");
    expect(page).toContain("showAiDraft");
  });
});
