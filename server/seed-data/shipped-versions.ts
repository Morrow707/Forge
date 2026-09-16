import { createHash } from "node:crypto";

/** Recognising a document Forge itself shipped earlier, so a later edit to it can reach an
 * installation that already took the previous one.
 *
 * The problem this solves shows up the second time a live document changes. The first migration
 * of each document could match the exact text it replaced -- the placeholder, the draft -- and
 * that is what makes "never clobber an admin's edit" safe: an exact match can only be a document
 * Forge wrote. But once production is carrying VERSION 1 of a document Forge wrote, a change to
 * version 2 has nothing to match on, and the fix silently reaches new installations only. That is
 * the worst shape of bug for this code: it looks like it worked.
 *
 * Hashes rather than full prior texts, because the alternative is keeping every historical
 * document verbatim in the source forever and the list only grows. A hash is enough to answer the
 * one question being asked -- "is this byte-for-byte something we shipped?" -- and nothing else is
 * being asked of it. Not a security boundary; sha256 here is a content fingerprint.
 *
 * ADDING A VERSION: when you edit a live document, append the hash of the text you are REPLACING.
 * shipped-versions.test.ts pins the current text's hash, so an edit fails it with instructions --
 * that failure is the reminder, because nothing else about the edit would tell you.
 */
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** True when `current` is byte-for-byte a version Forge shipped. An admin's edit -- even one made
 * by changing a single character of a shipped version -- is not, and is left alone. */
export function isShippedVersion(current: string, hashes: readonly string[]): boolean {
  return hashes.includes(sha256(current));
}

/** How long a prefix of `current` is a shipped version, or -1 for none.
 *
 * The signup agreement is never stored on its own: seed.ts appends the healthcare-provider notice
 * to whatever is live, so production carries "shipped document + \n\n + notice" and a
 * whole-document hash matches nothing. Splitting at every candidate length and hashing the prefix
 * is O(versions), not O(document), because only the lengths of documents we actually shipped are
 * worth testing -- and a prefix that hashes to a shipped version cannot be a coincidence.
 *
 * `lengths` must line up with `hashes` by index. */
export function shippedPrefixLength(
  current: string,
  hashes: readonly string[],
  lengths: readonly number[],
): number {
  for (let i = 0; i < hashes.length; i++) {
    const len = lengths[i];
    if (len === undefined || current.length < len) continue;
    if (sha256(current.slice(0, len)) === hashes[i]) return len;
  }
  return -1;
}

/** PREVIOUS versions of the signup agreement Forge shipped, oldest first. The CURRENT text
 * is deliberately not here -- it is handled by an equality check, and listing it would make the
 * document match itself as "something to migrate away from". */
export const SIGNUP_AGREEMENT_PRIOR_SHIPPED = [
  // The first real terms, replacing the PLACEHOLDER text (600c9c1).
  "947e8481794b56764889857299e9c486c4f4e3c66c251b07fe6dbe18c739acb2",
] as const;

/** Character length of each entry in SIGNUP_AGREEMENT_PRIOR_SHIPPED, same order.
 *
 * Needed because this document is stored with the healthcare notice appended, so the migration
 * has to find where the shipped part ENDS before it can hash it. Kept beside the hashes rather
 * than derived, since deriving it would mean keeping the full prior texts -- which is the thing
 * hashes exist to avoid. A wrong length simply fails to match and the document is left alone,
 * which is the safe direction. */
export const SIGNUP_AGREEMENT_PRIOR_LENGTHS = [11274] as const;

/** PREVIOUS versions of the video and biometric release, oldest first. See above. */
export const BIOMETRIC_RELEASE_PRIOR_SHIPPED = [
  // The first real release, replacing BIOMETRIC_WAIVER_DRAFT (9539965).
  "b1a705d735bedc0f2b2f5c3522fc2882500cfcc4f95e7618dc788fe38f31f6c5",
] as const;
