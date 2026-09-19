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
  // Gained governing law, the business address and the healthcare-notice split (f0adc47).
  "1f1710bd22aa595ef58e1f9754a22bfd2dda120ec720d97072d76b3ce981a25f",
  // Called the video and biometric document a "release" in three places, after that document
  // had been retitled to a consent. The agreement a user accepts must name the other document
  // they are being pointed at by the name that document actually carries.
  "6c195eafbf7c4b884f4664756aec7d74444db12024e90bb5574b7e071efc9d5e",
  // Counsel's rewrite of 2026-09-19 replaced this one wholesale: the whole document was redrafted
  // by the attorney, so there is no sentence to patch. This is the last Forge-written version --
  // the one production is carrying -- and it is what the migration recognises in order to move an
  // existing installation onto the reviewed text.
  "3ab92c73e1c270a98c3302241dba317464035cdc689633aea98234a6fb829e02",
] as const;

/** Character length of each entry in SIGNUP_AGREEMENT_PRIOR_SHIPPED, same order.
 *
 * Needed because this document is stored with the healthcare notice appended, so the migration
 * has to find where the shipped part ENDS before it can hash it. Kept beside the hashes rather
 * than derived, since deriving it would mean keeping the full prior texts -- which is the thing
 * hashes exist to avoid. A wrong length simply fails to match and the document is left alone,
 * which is the safe direction. */
export const SIGNUP_AGREEMENT_PRIOR_LENGTHS = [11274, 11937, 12126, 12114] as const;

/** PREVIOUS versions of the video and biometric release, oldest first. See above. */
export const BIOMETRIC_RELEASE_PRIOR_SHIPPED = [
  // The first real release, replacing BIOMETRIC_WAIVER_DRAFT (9539965).
  "b1a705d735bedc0f2b2f5c3522fc2882500cfcc4f95e7618dc788fe38f31f6c5",
  // Gained the business address (f0adc47).
  "906fc9ad5600aa550f8b475d04c64ef1c8faa1c10a763ceff500906d6fdb5893",
  // Titled "CONSENT AND RELEASE" while releasing nothing, and the only user-facing document
  // with no governing law or dispute clause -- so the one a guardian agrees to about their
  // child did not carry "nothing here waives a right that cannot lawfully be waived, including
  // a right belonging to a person under 18". Both fixed; this is the text they replaced.
  "e2f21ac408046074dfe8278ee6cceeece1b544b334d42582f17be023f4fe064f",
] as const;

/** PREVIOUS versions of the notice to parent or guardian, oldest first. See above.
 *
 * This document needed a lane at all because it is DELIVERED -- its text is embedded in the
 * guardian-invite email, and for an athlete under 13 it is what guardian_coppa_consent records
 * as the thing that was agreed to. A correction that reaches only new installations would leave
 * every existing parent reading the old one. */
export const PARENTAL_NOTICE_PRIOR_SHIPPED = [
  "8bb0c75e99088d382afbc886cca9cced91e4bd91ba108b8da0f73474066872aa",
  "870ce1f4633138164b90278a5fe06367e50eba7e9764a158898aba3b18b7301d",
  "e347a9f7cb769becf66d08f96b9c0ef70b693ecd5f4352a5450ec53f02a0b035",
  "99c15769c09c622a4c38437704be2eaf80d52b42a320daa291c1b383526389a5",
  "30b0dacc768a7c1762793f015e8063dd689e2d9b796eabea9f0c508a35b1ec95",
  // 2026-09-19 launch-readiness pass: the collected-data list gained nutrition and Apple Health, and
  // the retention section gained the per-program cap.
  "ac5af50708b3d388629bb0bd8aba61168c4fe0b61078c53e56fc2e1785ae4711",
  // 2026-09-19, later the same day: s1 gained the sentence saying the claim is the federally
  // required consent for an under-13 and that a confirming email follows. Scott's decision.
  "9589612c71d41d988fca862a5f1379aa5d79519285f1eff10cb018e647dffb0b",
] as const;

/** EVERY stored shape of the privacy policy Forge ever shipped, current one excluded.

 * Two entries per version, deliberately: an installation that has redeployed holds the shape
 * LIVE_DOCUMENT_PATCHES leaves behind, and one that seeded and never redeployed holds the source
 * text exactly. Listing only one of the two strands the other kind.
 *
 * The oldest of these predate the research-sharing section and the subject-code paragraph, so an
 * installation holding one describes an admin analytics surface Forge no longer has. Some also
 * name FORGE ATHLETIC TECHNOLOGIES LLC, a company that no longer exists -- which is the clearest
 * case there is for replacing a document wholesale rather than patching sentences in it. */
export const PRIVACY_POLICY_PRIOR_SHIPPED = [
  "de816ec9b3efbca8402182a9118fe7796f7ca1c98cde33e8334c4d446f6a9b27",
  "1dc4eb085f048ce1e388407c9f919bd9f3e6ff70eec7a600a52694d29877e628",
  "afc0584e301fd55241e7e44cadb398da8a53e7a155c57072e9709d580fd79897",
  "d788f23ff8083a40133a1508be8c05d27bb84188549c6e62d8882250a95f40f3",
  "5d3b0240c7f181513917cf5a99c2e578b4f89205f35d6d54061b11ddb50c6df7",
  "29ed4c2a0cd7ae14415d743002f8b61fa1e1b337f0e38d5248fbb11bbd531a77",
  "0e7d9b079f0d6acf8a34aca0c1cacf08e302d30194c42cdfe5a1dff1b827a6cc",
  // 2026-09-19 launch-readiness pass: Apple Health disclosed, three processors added (Stripe, Sentry,
  // IP geolocation), the under-13 signup sentence corrected, retention given real numbers, the
  // 'not yet reviewed by counsel' admission and the 'no version tracking' sentence removed.
  "ea972e2aebe9e2cf87aeb3658ae5eaba344add1b274041347b2e281d6ddfcfcc",
  // 2026-09-19, later the same day: s4's 'not yet finalized by counsel' sentence replaced with the
  // biometric-consent statement, s5 gained the COPPA sentence. Scott's decision, pending review.
  "ffd2e131d663bcee3b3d89ffba251b995343fdf2e2f4f14c5891f5ea8afa5b74",
] as const;
/** EVERY stored shape of the terms of service Forge ever shipped, current one excluded.

 * Same two-shapes-per-version rule as the privacy policy above. The oldest here carry
 * "[Placeholder -- to be set once the company's home jurisdiction is finalized.]" where governing
 * law belongs, and name FORGE ATHLETIC TECHNOLOGIES LLC as the liable entity. A document naming
 * the wrong company is not something to fix with a sentence patch. */
export const TERMS_OF_SERVICE_PRIOR_SHIPPED = [
  "47367a2e4dcb9bfc27db7240f5bcd4c84b080807bb0e8069a69a28aa5350561e",
  "77ba725a6505b32db815e5d4db47b531d2e4b325dbbaf76bde87b05a258dde9e",
  "9fe5c4a5c59661074aa5f28218114c59225628de9eb699a87b759c9916522865",
  "827ddbd3d850501d59adc794266786ef3bc0802771bf7077fcbd908bd6d47de2",
  "b51209c610f677c44e020afe98f7b68344079ac70180eeb88443c11656d3bcd2",
  "b96386b86189840781a590451743468ef73345cac9d4391648d44c4c9e971aa6",
  "2160c9605752c049445d5e8d5bab32b6e40a43731ce040398892dfde909c960d",
  "c79d547edbd11ce6737253747e42eefef8828561a51b64f4d92b74163198f2e4",
  "477d50ecba839e87cd0c6897fcc9468ccc69d79922527a2d73e53c38b4a862f5",
  // 2026-09-19 launch-readiness pass: guardian acceptance sentence, framework names dropped from s2,
  // the under-13 signup sentence corrected in s4, parent (not coach) permission in s6.
  "0587dbda49107e1d7718a6ee1b4230aee8fab13c0950a6fe34f84bec15aa66ae",
  // 2026-09-19, later the same day: s8 describes the paid plans ahead of billing going live so the
  // paperwork does not change at launch (Scott), s15 gained the minors sentence.
  "402bd7e07d5fa16bf3b647fd58f1ab8d4b3796804b5e724f76626d28e22f7a90",
] as const;
