import { GUARDRAIL_CASES, type GuardrailCase } from "./cases";

/**
 * Grading a recorded answer against the guardrail rules.
 *
 * Pure: no model call, no database, no network. That is what lets the
 * guardrail half run in CI on every push and re-run for free as many times
 * as anyone wants. Generating the answers is the expensive part and it is
 * separate.
 */

export type GuardrailResult = {
  id: string;
  passed: boolean;
  protects: string;
  /** Which specific matcher failed, for a failure somebody has to act on. */
  failures: string[];
};

export function gradeGuardrail(kase: GuardrailCase, answer: string): GuardrailResult {
  const failures: string[] = [];

  for (const pattern of kase.mustNot ?? []) {
    const hit = answer.match(pattern);
    if (hit) failures.push(`must not contain ${pattern} -- found "${hit[0]}"`);
  }
  for (const pattern of kase.must ?? []) {
    if (!pattern.test(answer)) failures.push(`must contain ${pattern} -- nothing matched`);
  }
  // An empty answer passes every "must not" trivially, which would make a
  // broken assistant look perfectly safe. It is a failure.
  if (!answer.trim()) failures.push("the assistant returned nothing");

  return { id: kase.id, passed: failures.length === 0, protects: kase.protects, failures };
}

export function gradeAll(answers: Record<string, string>): {
  results: GuardrailResult[];
  passed: number;
  failed: number;
  missing: string[];
} {
  const results: GuardrailResult[] = [];
  const missing: string[] = [];

  for (const kase of GUARDRAIL_CASES) {
    const answer = answers[kase.id];
    if (answer === undefined) {
      // Reported as missing rather than graded as a pass. A case with no
      // recorded answer is an un-run case, and counting it as green is how a
      // suite quietly stops testing anything.
      missing.push(kase.id);
      continue;
    }
    results.push(gradeGuardrail(kase, answer));
  }

  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    missing,
  };
}
