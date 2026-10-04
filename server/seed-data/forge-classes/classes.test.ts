import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORGE_CLASSES } from "./index";
import { classLessonQuizQuestionInputSchema } from "@shared/schema";
import { longestSharedRun } from "../../academy-draft-guard";

/** Shape checks on the repo-written classes, so a chapter cannot ship thin, a drill cannot
 * name a skill the library does not have, and a quiz cannot carry a question the grader
 * refuses. Mirrors server/seed-data/coaches-corner/tracks.test.ts. */
const seedSource = readFileSync(resolve(__dirname, "../../seed.ts"), "utf8");

describe("Forge classes", () => {
  for (const cls of FORGE_CLASSES) {
    describe(cls.name, () => {
      it("has six chapters, each with pages, a Key Points page, a drill day, cards and a quiz", () => {
        expect(cls.chapters.length).toBeGreaterThanOrEqual(6);
        for (const ch of cls.chapters) {
          expect(ch.content.length).toBeGreaterThanOrEqual(4);
          expect(ch.content[ch.content.length - 1].body.startsWith("Key points:")).toBe(true);
          for (const page of ch.content.slice(0, -1)) expect(page.body.split(/\s+/).length).toBeGreaterThan(80);
          expect(ch.drills.length).toBeGreaterThanOrEqual(3);
          expect(ch.flashcards.length).toBeGreaterThanOrEqual(5);
          expect(ch.quizQuestions.length).toBeGreaterThanOrEqual(4);
        }
      });

      it("names only drills the skill library seeds", () => {
        for (const ch of cls.chapters) {
          for (const name of ch.drills) {
            expect(seedSource.includes(`name: "${name}"`), `missing drill "${name}"`).toBe(true);
          }
        }
      });

      it("every quiz question passes the input schema, and the shapes are mixed", () => {
        const types = new Set<string>();
        for (const ch of cls.chapters) {
          for (const q of ch.quizQuestions) {
            const parsed = classLessonQuizQuestionInputSchema.safeParse({
              orderIndex: 0,
              questionText: q.questionText,
              questionType: q.questionType ?? "multiple_choice",
              payload: q.payload ?? null,
              answers: (q.answers ?? []).map((a, i) => ({ ...a, orderIndex: i })),
            });
            expect(parsed.success, `${ch.title}: ${q.questionText} ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
            types.add(q.questionType ?? "multiple_choice");
          }
        }
        expect(types.size).toBeGreaterThanOrEqual(3);
      });

      it("no two pages share a long run of words", () => {
        const bodies = cls.chapters.flatMap((ch) => ch.content.slice(0, -1).map((p) => p.body));
        for (let i = 0; i < bodies.length; i++)
          for (let j = i + 1; j < bodies.length; j++)
            expect(longestSharedRun(bodies[i], bodies[j]), `pages ${i} and ${j}`).toBeLessThan(12);
      });

      it("makes no camera accuracy claim", () => {
        const text = JSON.stringify(cls).toLowerCase();
        for (const banned of ["mph", "miles per hour", "accurate to", "precisely measures"]) expect(text.includes(banned), banned).toBe(false);
      });
    });
  }
});
