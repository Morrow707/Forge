import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Scott, 2026-10-04, on counsel's question 12: "remove it". No assistant reads an unlicensed
 * source: every searchKnowledgePassages call in storage.ts passes licensedOnly. The admin's
 * own library search in routes.ts is the one exception, because it is how an admin checks what
 * a source holds before licensing or deleting it. */
describe("the assistants read licensed sources only", () => {
  it("every retrieval in storage.ts is licensedOnly", () => {
    const src = readFileSync(resolve(__dirname, "storage.ts"), "utf8");
    const calls = [...src.matchAll(/searchKnowledgePassages\(\{[\s\S]*?\}\)/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const call of calls) expect(call, call).toContain("licensedOnly: true");
  });
});
