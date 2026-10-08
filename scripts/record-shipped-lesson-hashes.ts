/** Appends the sha256 of every repo-written Coaches Corner lesson's CURRENT content, and of every
 * quiz question's current text/answers, to server/seed-data/coaches-corner/shipped-lesson-hashes.ts,
 * skipping hashes already there. Run after editing any track, then commit the result:
 *   npx tsx scripts/record-shipped-lesson-hashes.ts
 * Never removes a hash: the old versions are what let a deployed row be recognised as Forge's. */
import { readFileSync, writeFileSync } from "node:fs";
import { ALL_COACHES_CORNER_TRACKS } from "../server/seed-data/coaches-corner/index";
import {
  SHIPPED_LESSON_CONTENT_HASHES,
  SHIPPED_QUIZ_QUESTION_HASHES,
  lessonContentHash,
  quizQuestionHash,
} from "../server/seed-data/coaches-corner/shipped-lesson-hashes";

const file = "server/seed-data/coaches-corner/shipped-lesson-hashes.ts";
let src = readFileSync(file, "utf8");
const today = new Date().toISOString().slice(0, 10);

function append(constName: string, lines: string[]) {
  if (!lines.length) return;
  const start = src.indexOf(`export const ${constName}`);
  const end = src.indexOf("\n]);", start);
  if (start < 0 || end < 0) throw new Error(`could not find the end of ${constName}`);
  src = src.slice(0, end) + "\n" + lines.join("\n") + src.slice(end);
}

const lessons: string[] = [];
const questions: string[] = [];
for (const track of ALL_COACHES_CORNER_TRACKS) {
  for (const lesson of track.lessons) {
    const h = lessonContentHash(lesson.content);
    if (SHIPPED_LESSON_CONTENT_HASHES.has(h) || lessons.some((a) => a.includes(h))) continue;
    lessons.push(`  "${h}", // ${track.title} / ${lesson.lessonNumber} (${today})`);
  }
  for (const q of track.quizQuestions) {
    const h = quizQuestionHash(q);
    if (SHIPPED_QUIZ_QUESTION_HASHES.has(h) || questions.some((a) => a.includes(h))) continue;
    questions.push(`  "${h}", // ${track.title} / q${q.orderIndex} (${today})`);
  }
}
append("SHIPPED_LESSON_CONTENT_HASHES", lessons);
append("SHIPPED_QUIZ_QUESTION_HASHES", questions);
if (!lessons.length && !questions.length) {
  console.log("Every lesson and question is already recorded.");
} else {
  writeFileSync(file, src);
  console.log(`Recorded ${lessons.length} new lesson version(s) and ${questions.length} new question version(s).`);
}
