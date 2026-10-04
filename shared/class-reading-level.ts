/** A class's reading level (2026-10-04). Set on the class by its author, honoured by every AI
 * draft for that class (pages, flashcards, quiz) and shown on the catalog card. Null means the
 * author never chose, which the drafters treat as high school: most athletes on Forge are. */
export const CLASS_READING_LEVELS = ["middle_school", "high_school", "college"] as const;
export type ClassReadingLevel = (typeof CLASS_READING_LEVELS)[number];

export const CLASS_READING_LEVEL_LABELS: Record<ClassReadingLevel, string> = {
  middle_school: "Middle school (ages 11-14)",
  high_school: "High school (ages 14-18)",
  college: "College and adult",
};

/** The one sentence every drafter appends, so the three agree on what a level means. */
export function readingLevelInstruction(level: ClassReadingLevel | null | undefined): string {
  switch (level ?? "high_school") {
    case "middle_school":
      return "Write for a middle-school athlete, ages 11 to 14: short sentences, everyday words, one idea per sentence, and explain any technical term the first time it appears.";
    case "college":
      return "Write for a college-age or adult athlete: precise technical vocabulary is welcome, sentences can carry more than one idea, and no term needs defining unless it is unusual.";
    default:
      return "Write for a high-school athlete, ages 14 to 18: plain sentences, technical terms allowed when the lesson defines them, nothing that reads like a textbook.";
  }
}
