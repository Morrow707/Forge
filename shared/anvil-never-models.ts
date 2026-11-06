/**
 * ITEM 12: WHAT THE ANVIL WILL NEVER MODEL, AND WHO A FINDING GOES TO.
 *
 * Two halves and only one of them can be built today.
 *
 * **THE FIRST HALF IS DECIDED AND IS ENFORCED HERE.** The Anvil does not model, score, flag or
 * alert on concussion, and does not model RED-S or disordered eating. Both are in the packet to
 * counsel as statements of what Forge will not do. The reasons differ and both matter:
 *
 *  - **Concussion**: the tasks resemble sideline testing closely enough that a score will be read
 *    as a screen whatever the product says, and the published consensus cautions specifically
 *    against computerised neurocognitive testing in younger athletes. A daily cognitive number on
 *    a 14-year-old is not a worse concussion screen than nothing -- it is a worse one than the
 *    clinician they should be sent to.
 *  - **RED-S**: it can present with autonomic readings that look BETTER rather than worse, so a
 *    readiness model does not merely miss it, it can actively point the other way.
 *
 * `anvil-never-models.test.ts` enforces this as a forbidden form over the Anvil's own modules and
 * surfaces -- the same scope discipline as `anvil-vocabulary.ts`, for the same reason: three of
 * these words appear legitimately elsewhere in Forge.
 */

export const ANVIL_NEVER_MODELS: ReadonlyArray<{ topic: string; why: string }> = [
  {
    topic: "concussion",
    why:
      "The four tasks resemble sideline testing closely enough that any score will be read as a " +
      "screen whatever the product says, and the published consensus cautions against " +
      "computerised neurocognitive testing in younger athletes specifically. The alternative to a " +
      "bad screen is a clinician, not a better screen.",
  },
  {
    topic: "RED-S",
    why:
      "Relative energy deficiency in sport can present with autonomic readings that look better " +
      "rather than worse, so a readiness model does not merely fail to detect it -- it can point " +
      "the opposite way while the athlete gets worse.",
  },
  {
    topic: "disordered eating",
    why:
      "The exclusion channel can see a sustained energy deficit in an athlete's own food log. " +
      "Seeing a pattern and modelling it are different acts, and the second one puts a screen in " +
      "front of a child about their own eating.",
  },
];

/**
 * **THE SECOND HALF IS BLOCKED, AND IT IS BLOCKED ON A QUESTION FORGE HAS ASKED.**
 *
 * The decision said these "must route to a named adult, not to the coach". Who that adult IS, and
 * whether Forge may or must tell them anything at all, is follow-up 3 to counsel of 2026-11-06:
 * whether Forge itself incurs a mandatory child-welfare reporting obligation in any state where it
 * operates, and whether the coach -- as a school or club employee reading the data on Forge --
 * incurs one the Institutional Service Agreement has to account for.
 *
 * **The answer changes the design rather than filling in a blank.** If the coach is a mandated
 * reporter, the path runs through them and the agreement; if Forge incurs its own obligation, it
 * does not. Building a recipient before that is answered would be building the wrong one, and the
 * two shapes are not a configuration apart.
 *
 * So the slot is declared UNRESOLVED rather than defaulted. A default here is the worst available
 * option: it would be invisible, it would be wrong half the time, and the half it is wrong about
 * is a child.
 */
export type EscalationRecipient =
  | { readonly resolved: false; readonly blockedOn: string }
  | { readonly resolved: true; readonly role: "guardian" | "named_program_adult" | "forge" };

export const ESCALATION_RECIPIENT: EscalationRecipient = {
  resolved: false,
  blockedOn:
    "counsel follow-up 3 of 2026-11-06: whether Forge, or the coach as a school or club employee, " +
    "incurs a mandatory reporting obligation. The answer decides which path exists, not which " +
    "option is configured.",
};

/**
 * Until it resolves, an exclusion finding is shown to the ATHLETE and to nobody else, with no
 * interpretation attached. That is not a design choice so much as the only option that cannot be
 * wrong: it tells the person the data is about what their own data says, and it asserts nothing to
 * anybody who might owe a duty nobody has established yet.
 */
export const EXCLUSION_FINDING_AUDIENCE = "athlete_only_pending_counsel" as const;
