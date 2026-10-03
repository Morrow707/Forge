import { describe, expect, it } from "vitest";
import { COACHES_CORNER_TRACKS_2026_10 } from "./index";
import { longestSharedRun } from "../../academy-draft-guard";

/** The 2026-10-03 tracks: four lessons and eight questions each, one correct answer per
 * question with an explanation on every answer, no certification mark anywhere (counsel,
 * question 13), lessons of a real length, and no two lessons sharing a long run of words
 * (a copy-paste between tracks would show up here before it shipped). */
describe("the 2026-10 Coaches Corner tracks", () => {
  it("are complete and well formed", () => {
    expect(COACHES_CORNER_TRACKS_2026_10.length).toBe(6);
    for (const t of COACHES_CORNER_TRACKS_2026_10) {
      expect(t.lessons).toHaveLength(4);
      expect(t.quizQuestions).toHaveLength(8);
      expect(t.keyPrinciplesForAi.split(/\s+/).length).toBeGreaterThan(60);
      t.lessons.forEach((l, i) => {
        expect(l.lessonNumber).toBe(i + 1);
        expect(l.content.split(/\s+/).length).toBeGreaterThan(250);
        expect(l.content).not.toMatch(/^#|\n- |\*\*/);
      });
      t.quizQuestions.forEach((q, i) => {
        expect(q.orderIndex).toBe(i);
        expect(q.answers).toHaveLength(4);
        expect(q.answers.filter((a) => a.isCorrect)).toHaveLength(1);
        for (const a of q.answers) expect(a.explanation.length).toBeGreaterThan(20);
      });
    }
  });

  it("name no certification body", () => {
    const text = JSON.stringify(COACHES_CORNER_TRACKS_2026_10);
    expect(text).not.toMatch(/\bCSCS\b|\bNSCA\b/);
  });

  it("do not repeat each other", () => {
    const lessons = COACHES_CORNER_TRACKS_2026_10.flatMap((t) => t.lessons.map((l) => ({ track: t.title, ...l })));
    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        const run = longestSharedRun(lessons[i].content, lessons[j].content);
        expect(run, `${lessons[i].track} / ${lessons[i].title} vs ${lessons[j].track} / ${lessons[j].title}`).toBeLessThanOrEqual(12);
      }
    }
  });
});
