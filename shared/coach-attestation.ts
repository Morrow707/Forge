/** WHAT A COACH IS ACTUALLY ASSERTING WHEN THEY PUT AN UNDER-13 ON A ROSTER.
 *
 * A Tier 1 account has no verified-parent step. Nobody's parent typed anything: a coach created
 * the slot, the child claimed it, and the only consent behind the account is the coach acting as
 * the programme's agent. COPPA allows that -- a school or programme can relay a parent's
 * permission -- but only for what the coach actually asserts, which means the assertion has to
 * exist and has to be recorded.
 *
 * IT DID NOT. The consent record written for a Tier 1 claim is typed `coach_coppa_consent` and
 * reads "Coach/Program Consent (Tier 1 agent)" on the compliance report, and the text stored in
 * it was FORGE'S TERMS OF USE. So the row a regulator would read as the COPPA basis for a
 * ten-year-old's account said only that a coach had accepted some terms. True, and not the
 * question. Nothing anywhere asserted that a parent had said yes.
 *
 * Worded to claim exactly what it can. It does not say Forge verified anything, because Forge
 * verified nothing -- the same discipline as acknowledgeGuardianNotice in storage.ts, whose text
 * has always said the consent was obtained "outside of Forge" for this reason. A record that
 * overclaims is worse than no record: it is the document that gets produced when somebody asks,
 * and it has to survive being read closely. */
export const COACH_COPPA_ATTESTATION = `COACH / PROGRAM ATTESTATION FOR AN ATHLETE UNDER 13

I am adding an athlete under the age of 13 to my roster on Forge.

I confirm that:

- A parent or legal guardian of this athlete has given permission for this athlete to use Forge as part of my program, and I am relaying that permission as the program's agent.
- I have told that parent or guardian what Forge collects -- training logs, and, where they turn it on, video of their child training and the measurements taken from it.
- Forge itself has not verified this permission and has captured no signature from the parent or guardian. My confirmation here is the only record of it.
- The parent or guardian can be reached at the email address I have supplied, and camera tracking stays off for this athlete until they turn it on themselves.

I understand this attestation is recorded against my account, with the date and time, as the consent this athlete's account rests on.`;

/** Under 13 is the whole question here, and the intake sheet may give an age, a date of birth,
 * or neither. Neither is not "no": a coach who has not filled in an age has not told us the
 * athlete is old enough, and the attestation is the cheaper mistake. */
export function needsCoppaAttestation(input: {
  age?: number | null;
  dateOfBirth?: string | null;
}): boolean {
  if (typeof input.age === "number") return input.age < 13;
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const years = (Date.now() - dob.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
      return years < 13;
    }
  }
  return false;
}

/** What the record says when a Tier 1 account arrives WITHOUT an attestation.
 *
 * It can: the intake sheet may carry no age, in which case nothing at slot-creation time knew
 * this athlete was under 13, and the real date of birth only shows up when they claim. Writing
 * COACH_COPPA_ATTESTATION then would assert a confirmation the coach was never shown -- which is
 * the exact defect this file exists to fix, reintroduced one branch over.
 *
 * So the record says what happened instead. The account still gets made: refusing at claim time
 * strands a child halfway through signup over a field their coach left blank months earlier, and
 * the account is already flagged for the guardian-notice chase (requiresGuardianNotice), which is
 * the mechanism that gets a real confirmation on file. */
export const COACH_COPPA_ATTESTATION_NOT_TAKEN = `NO COACH ATTESTATION WAS TAKEN FOR THIS ATHLETE.

This athlete is under 13. The roster slot they claimed was created before their date of birth was known, so the coach who created it was never shown the under-13 attestation and has not confirmed that a parent or legal guardian gave permission.

This account is flagged for a guardian notice. Until a parent or guardian consent is recorded, nothing here evidences one.`;
