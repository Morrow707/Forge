import fs from "node:fs";
import path from "node:path";
import { GUARDRAIL_CASES } from "./cases";
import { gradeAll } from "./grade";
import { getAiUsage } from "../ai-usage";

/**
 * Runs the guardrail suite.
 *
 * Two modes, and the default is the cheap one:
 *
 *   npm run eval          grade the recorded answers in answers.json
 *   npm run eval --live   ask the real assistants first, then grade
 *
 * The recorded answers are checked in. That is what makes this runnable in
 * CI on every push, by anyone, for free -- a suite that costs money to run
 * is a suite that runs once and then never again. Regenerating is a
 * deliberate act, and it prints what it spent.
 */

const ANSWERS_PATH = path.join(import.meta.dirname, "answers.json");

function loadAnswers(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(ANSWERS_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function generateAnswers(): Promise<Record<string, string>> {
  // Imported lazily so the graded-only path needs no database and no API key.
  const { storage } = await import("../storage");
  const { db } = await import("../db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const answers: Record<string, string> = {};

  for (const kase of GUARDRAIL_CASES) {
    process.stdout.write(`  ${kase.id} ... `);
    try {
      if (kase.surface === "nutrition") {
        // The age matters to several rules, so the fixture athlete is aged
        // to the case rather than the case being written around a fixture.
        const [athlete] = await db.select().from(users).where(eq(users.role, "athlete")).limit(1);
        if (!athlete) throw new Error("no athlete in this database to ask as");
        if (kase.athleteAge != null) {
          await db.update(users).set({ age: kase.athleteAge }).where(eq(users.id, athlete.id));
        }
        const result = await storage.answerNutritionQuestion(athlete.id, kase.question);
        answers[kase.id] = "answer" in result && result.answer ? result.answer : "";
      } else {
        answers[kase.id] = "";
      }
      process.stdout.write("done\n");
    } catch (err) {
      process.stdout.write(`failed: ${err instanceof Error ? err.message : String(err)}\n`);
      answers[kase.id] = "";
    }
  }

  fs.writeFileSync(ANSWERS_PATH, `${JSON.stringify(answers, null, 2)}\n`);
  return answers;
}

async function main() {
  const live = process.argv.includes("--live");

  if (live) {
    console.log("Asking the assistants (this costs money):");
    await generateAnswers();
  }

  const answers = loadAnswers();
  const summary = gradeAll(answers);

  console.log("");
  for (const result of summary.results) {
    console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.id}`);
    if (!result.passed) {
      console.log(`      protects: ${result.protects}`);
      for (const failure of result.failures) console.log(`      ${failure}`);
    }
  }
  for (const id of summary.missing) {
    console.log(`MISSING  ${id} -- no recorded answer; run with --live`);
  }

  console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.missing.length} missing`);

  if (live) {
    try {
      const usage = await getAiUsage(1);
      console.log(`Spend today so far: $${usage.totalUsd.toFixed(2)}`);
    } catch {
      // No database is a fine reason not to print a number, not a reason to fail.
    }
  }

  // Three outcomes, deliberately distinct.
  //
  // A real grading failure always fails. A PARTIALLY recorded suite fails
  // too: somebody added a case and never recorded an answer for it, which is
  // a case that silently tests nothing. But a suite with NO answers recorded
  // at all is a different thing -- the harness exists and has never been run
  // live, which is the honest state of a fresh checkout and must not hold CI
  // red forever on a fact everybody already knows.
  //
  // The moment one answer is recorded, every missing case starts failing.
  // That is the property worth keeping: the ratchet only turns one way.
  const nothingRecorded = summary.results.length === 0 && summary.missing.length > 0;
  if (nothingRecorded) {
    console.log(
      "\nNo answers recorded yet, so nothing was graded. Run with --live against a database " +
        "to record them; from then on a missing case is a failure.",
    );
    process.exit(0);
  }

  process.exit(summary.failed > 0 || summary.missing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
