/**
 * WHAT AN ANVIL SURFACE MAY CALL THE NUMBER IT SHOWS.
 *
 * Scott, 2026-11-06: "Let's get rid of the neuro fatigue verbiage then, that's ok." The product
 * is called the Anvil, which claims nothing. A screen still has to describe the quantity, and
 * the words available to describe it are a LEGAL question rather than a copy question -- several
 * of them are health claims, and FDA's General Wellness policy is what separates "a training
 * number" from "a clinical screen".
 *
 * THIS FILE IS A WORKING POSITION, NOT COUNSEL'S ANSWER, AND THE DIFFERENCE IS LOAD-BEARING.
 * The lists below are Forge's own conservative reading, taken 2026-11-06 from an answer supplied
 * through Rocket Lawyer whose channel (the AI assistant, or attorney review) is not established.
 * `docs/legal-open-questions.md` question 24 is still open and carries the narrowed follow-up.
 * Both lists may move when it is answered; the MECHANISM here does not, which is the point of
 * writing it down before the first screen exists.
 *
 * THE SCOPE IS THE WHOLE DESIGN AND IT IS DELIBERATELY NARROW. These words are refused on an
 * ANVIL surface and nowhere else, because three of them name features Forge already ships:
 * `client/src/components/readiness-banner.tsx` and the live `/api/athlete/readiness` route,
 * `client/src/pages/athlete/recovery.tsx`, and the coach analytics surface. Measured 2026-11-06:
 * "readiness" appears in 15 user-visible client files, "recovery" in 18, "fatigue" in 3. A
 * platform-wide ban is therefore a rename of three shipped features across 33+ files, for a
 * product that has no users -- a far larger instruction than it looks, and not one anybody has
 * given. `anvil-vocabulary.test.ts` asserts the narrow scope IN BOTH DIRECTIONS, so widening the
 * scan and renaming the readiness page cannot happen quietly as somebody's tidy-up.
 *
 * WHY A MODULE AND NOT A STYLE NOTE: the repo's own shape for a decision that must not be
 * re-litigated and must bite a file nobody has written yet -- `NOT_PUBLIC_ON_PURPOSE` and
 * `FITTED_OVERRIDES` both exist as empty lists with live machinery around them. There is no Anvil
 * surface today, so the scan polices an empty set; it starts working the day the first screen is
 * committed, which is the only day it matters.
 */

/** The only word that is literally what the Anvil measures, and so carries no claim. */
export const ANVIL_PERMITTED_TERMS = ["reaction time"] as const;

/**
 * Refused on an Anvil surface. Each carries WHY, because a list of banned words with no reasons
 * is the thing somebody lengthens or deletes without knowing what they are trading.
 */
export const ANVIL_FORBIDDEN_TERMS: ReadonlyArray<{ term: string; why: string }> = [
  {
    term: "neuro-fatigue",
    why:
      "No accepted operational definition outside a laboratory. Central fatigue is defined by " +
      "twitch interpolation and TMS, neither of which is reachable from a phone.",
  },
  {
    term: "neural fatigue",
    why: "The same, in the spelling the design record used until 2026-11-06.",
  },
  {
    term: "fatigue",
    why:
      "A physiological state the Anvil does not quantify. Forge's own review found the claim that " +
      "mental fatigue degrades endurance performance falls to non-significant once publication " +
      "bias is corrected (Holgado et al. 2020), and the strength/power equivalent is a published " +
      "null (Van Cutsem et al. 2017). Naming the state asserts what the evidence does not carry.",
  },
  {
    term: "readiness",
    why:
      "Implies a judgement about whether the athlete should train, which is the Clinical Decision " +
      "Support edge. Forge's EXISTING readiness score keeps the word; see the scope note above.",
  },
  {
    term: "recovery",
    why: "A physiological state the Anvil does not measure. Same scope note.",
  },
  { term: "freshness", why: "A synonym for the above with no referent in anything measured." },
  { term: "load tolerance", why: "A claim about what the athlete can withstand. Not measured." },
  {
    term: "concussion",
    why:
      "Forge will not model, score, flag or alert on concussion. The tasks resemble sideline " +
      "testing, so the word on an Anvil surface invites exactly the reading the product refuses.",
  },
  { term: "screen", why: "Clinical screening. The Anvil screens for nothing." },
  { term: "diagnos", why: "Covers diagnose, diagnosis, diagnostic. The Anvil diagnoses nothing." },
];

/** Lowercased terms, for a scan. */
export const ANVIL_FORBIDDEN_TERM_WORDS: ReadonlyArray<string> =
  ANVIL_FORBIDDEN_TERMS.map((t) => t.term.toLowerCase());

/**
 * Does this client file count as an Anvil surface?
 *
 * DISCOVERED FROM WHAT A FILE DOES, never from a list of filenames, and the import clause is the
 * half that matters: a screen called something else entirely still reads the Anvil's data through
 * `shared/anvil-*`, and a rule keyed on names alone would miss it -- which is the assertion
 * direction this repo has had to relearn five times.
 */
/**
 * THE SERVER SIDE OF THE SAME QUESTION, AND IT IS A SEPARATE PREDICATE ON PURPOSE.
 *
 * `isAnvilSurface` admits a file two ways: its path, or its IMPORT of an Anvil module. The second
 * clause is the point on the client, where a card named `morning-card.tsx` can render an Anvil
 * number -- and it is wrong on the server, where `routes.ts` and `storage.ts` import Anvil modules
 * while serving the whole platform. Running the vocabulary over them finds "readiness" (a shipped
 * feature), "recovery" (another), "concussion" and "diagnos" (the consent and compliance text that
 * exists to REFUSE those claims) and would make the ratchet a demand to rename live features.
 *
 * So on the server membership is the PATH alone: a file whose job is the Anvil is named for it.
 * Written as its own export rather than a mode flag on `isAnvilSurface`, because a flag would make
 * "widen the client rule" a change that silently also moved the server rule, and the client rule is
 * the one question 24 is going to move.
 *
 * What it is for is narrow and real: `server/anvil-report.ts` prints a page a coach reads, and a
 * printed sentence outlives the screen it came from.
 */
export function serverFileIsAnvilOutput(relativePath: string): boolean {
  const p = relativePath.replace(/\\/g, "/");
  return /(^|\/)anvil[-/]/.test(p);
}

/**
 * ANVIL MODULES THAT CARRY NO NUMBER, AND WHY THE LIST RUNS THIS WAY ROUND.
 *
 * `isAnvilSurface`'s second clause admits a file by its IMPORT of an Anvil module, because a card
 * called `morning-card.tsx` can render an Anvil reading. That clause was too wide: `app-shell.tsx`
 * imports `anvil-routes` to put one entry in a nav, and sweeping it finds "recovery" (a shipped
 * feature's nav label), "screen" and "diagnos" (the AR Diagnosis entry) -- so the ratchet became
 * a demand to rename three live features, which the case below this one exists to refuse.
 *
 * The distinction that holds: a file importing a module that produces a NUMBER is describing that
 * number somewhere; a file importing a path map or a set of task timings is not. So these are the
 * modules whose import proves nothing, and **every other `shared/anvil-*` module counts** --
 * which is the fail-closed direction, the same way `searchableRolesFor` is the enum MINUS a
 * classified set rather than a list of what to scan. A new scoring module added next year puts
 * its importers in scope on the day it is written, rather than by somebody remembering to.
 */
export const ANVIL_MODULES_WITHOUT_A_NUMBER: ReadonlyArray<{ module: string; why: string }> = [
  {
    module: "anvil-routes",
    why: "A path per role. app-shell.tsx imports it for one nav entry and is the whole app's chrome.",
  },
  {
    module: "anvil-tasks",
    why: "Trial counts and timings the tasks need in order to be the tasks. No threshold, no reading.",
  },
  {
    module: "anvil-vocabulary",
    why: "This module. It names the forbidden words in order to forbid them.",
  },
  {
    module: "anvil-eligibility",
    why: "Who may take the check. A role, a birthday and a sentence -- never a measurement.",
  },
];

export function isAnvilSurface(relativePath: string, source: string): boolean {
  const p = relativePath.replace(/\\/g, "/");
  if (/(^|\/)anvil[-/]/.test(p) || /(^|\/)anvil\.tsx?$/.test(p)) return true;
  const bare = new Set(ANVIL_MODULES_WITHOUT_A_NUMBER.map((m) => m.module));
  for (const match of source.matchAll(/from\s+["'][^"']*shared\/(anvil-[a-z0-9-]+)["']/g)) {
    if (!bare.has(match[1])) return true;
  }
  return false;
}
