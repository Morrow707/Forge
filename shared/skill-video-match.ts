/**
 * WHETHER A YOUTUBE TITLE IS A DEMONSTRATION OF ONE SKILL DRILL (Scott, 2026-11-19: "run another
 * dry run for the skill drills").
 *
 * The lift matcher reads a name as [modifier] [equipment] [muscle] [movement] and a drill name has
 * no such shape: "Tee Work - Inside Pitch", "Bunt Placement Drill", "Two-Strike Approach Drill"
 * gave it no movement word, so the first skill dry run skipped all 398. A drill is matched by a
 * simpler rule instead, and every drill match is tier B -- a person approves each one, because a
 * rule this simple cannot tell a demonstration from a highlight on its own:
 *
 *   - every word of the drill's name is in the title (in any order; "drill" and filler aside);
 *   - none of the words that mark a title as something other than a demonstration (RED_FLAG_WORDS:
 *     "best", "mistake", "fix", "vs", a PR attempt) is in it;
 *   - it plays inside Forge and fits the length cap (checked by the caller with the video).
 */
import { FILLER, RED_FLAG_WORDS, normalize } from "./exercise-name-grammar";

/** Words a drill name carries that a demonstration's title need not repeat. */
const DRILL_WORDS = new Set(["drill", "drills"]);

const nameWords = (name: string) =>
  normalize(name).filter((t) => !FILLER.has(t) && !DRILL_WORDS.has(t));

export type SkillTitleVerdict = { ok: true } | { ok: false; reason: "missing_words" | "red_flag"; detail: string };

export function skillTitleVerdict(drillName: string, title: string): SkillTitleVerdict {
  const titleWords = new Set(normalize(title));
  const flagged = [...titleWords].filter((t) => RED_FLAG_WORDS.has(t));
  if (flagged.length > 0) return { ok: false, reason: "red_flag", detail: `title says ${flagged.join(", ")}` };
  const missing = nameWords(drillName).filter((w) => !titleWords.has(w));
  if (missing.length > 0) return { ok: false, reason: "missing_words", detail: `title is missing ${missing.join(", ")}` };
  return { ok: true };
}

/** The search sent to YouTube for a drill: its name and its skill type, so "Front Toss" is
 *  looked for as a hitting drill. The title still has to pass skillTitleVerdict against the name. */
export function skillSearchQuery(drillName: string, skillType: string | null | undefined): string {
  return [drillName, skillType ?? "", "drill"].filter(Boolean).join(" ").trim();
}
