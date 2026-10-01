/**
 * WHAT MAKES A PASSWORD ACCEPTABLE, IN ONE PLACE.
 *
 * Six separate schemas set a password (signup, the two claim flows, reset, change, and the
 * account-settings change) and before this they each carried their own `z.string().min(6)`.
 * Six copies of a rule is six chances for one of them to keep the old rule after the others
 * move, and the one that lags is a quiet hole rather than a visible bug: the account is
 * created, it just has a weaker password than the product promises.
 *
 * NO ZOD AND NO SCHEMA IMPORT HERE, DELIBERATELY. The signup screen draws a live checklist
 * from these same rules, and `shared/schema.ts` must never enter the client bundle -- one
 * literal import of it from a page used to drag 291 kB of schema, zod and drizzle into the
 * eager entry (see CLAUDE.md, "The schema never enters the client bundle"). Plain predicates
 * let the form and the validator agree without the form paying for the validator.
 *
 * LOGIN IS NOT ON THIS LIST, and that is the important part. Every account created before
 * this rule existed has a password that fails it. Applying it at sign-in would lock out the
 * whole platform at once, to no benefit: the password is already set, and the person typing
 * it is the owner. The rule belongs where a password is CHOSEN, never where one is checked.
 */

export const PASSWORD_MIN_LENGTH = 6;

export interface PasswordRule {
  /** Stable key, for test assertions and React list keys. */
  id: "length" | "number" | "special";
  /** Shown to the person as they type, in the present tense of a thing they have done. */
  label: string;
  test: (value: string) => boolean;
}

/**
 * A special character is anything that is not a letter or a digit, which deliberately
 * includes punctuation people actually reach for on a phone keyboard. A hand-picked
 * "!@#$%^&*" set is the usual version of this and it is worse: it rejects perfectly good
 * passwords for using a character the author did not think of, and the person has no way
 * to tell which one offended.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "number", label: "At least one number", test: (v) => /[0-9]/.test(v) },
  {
    id: "special",
    label: "At least one special character",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/** Every rule this value fails, in the order they are shown. Empty means acceptable. */
export function passwordProblems(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

export function passwordIsAcceptable(value: string): boolean {
  return passwordProblems(value).length === 0;
}
