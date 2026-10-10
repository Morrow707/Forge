/**
 * The Free Agent's nutrition assistant is shown the athlete's own food log.
 *
 * Until 2026-10-10 it was shown the targets on file and never what was eaten, so "am I getting
 * enough protein today" was answered with a general range and a request to type the day out --
 * the log it asked for was one table away. Scott, the same day: a coached athlete gets no AI
 * (their staff coach reads this; the route is Free Agent only), "the free agent yes, and can
 * give recommendations." This is the record the recommendation reads.
 *
 * A source scan, like the other prompt-shape ratchets: answerNutritionQuestion is ~200 lines of
 * prompt assembly over five queries and cannot be driven without a database. The scan pins the
 * three things that matter -- the two reads happen, the block reaches the prompt, and rule 1 is
 * restated inside it so the log can never become a licence to prescribe.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve(__dirname, "storage.ts"), "utf8");
const start = src.indexOf("async answerNutritionQuestion(");
const end = src.indexOf("\n  },\n", start);
const fn = src.slice(start, end);

describe("answerNutritionQuestion reads the athlete's own log", () => {
  it("fetches today's food log and the seven-day trend", () => {
    expect(fn).toMatch(/this\.getFoodLogForDate\(athleteId, formatISO\(new Date\(\), \{ representation: "date" \}\)\)/);
    expect(fn).toMatch(/this\.getNutritionTrendForAthlete\(athleteId\)/);
  });

  it("puts the log block into the dynamic system prompt, after the targets on file", () => {
    const dyn = fn.slice(fn.indexOf("const dynamicSystem = `"));
    expect(dyn).toContain("${targetsSummary || \"none set yet\"}");
    expect(dyn.indexOf("${foodLogBlock}")).toBeGreaterThan(dyn.indexOf("${targetsSummary"));
  });

  it("says the log is self-reported, says when it is empty, and restates rule 1 inside the block", () => {
    const block = fn.slice(fn.indexOf("const foodLogBlock = ["), fn.indexOf("].join(", fn.indexOf("const foodLogBlock = [")));
    expect(block).toMatch(/self-reported/);
    expect(block).toMatch(/Nothing logged today yet/);
    expect(block).toMatch(/never derive a new personal target from it \(rule 1\)/);
    expect(block).toMatch(/never\s*invent an entry they did not log|Never[\s\S]{0,40}invent an entry they did not log/);
  });

  it("stays Free Agent only at the route, so a coached athlete never meets it", () => {
    const routes = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf8");
    const i = routes.indexOf('"/api/athlete/nutrition/ask"');
    const head = routes.slice(i, i + 200);
    expect(head).toContain("requireFreeAgent");
  });
});
