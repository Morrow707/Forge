/** The one address Forge publishes to users.
 *
 * It exists as a constant because it had drifted: three legal documents gave
 * three different answers (an outlook.com address in the privacy policy and the
 * video release, legal@forgeperformance.com in the EULA), and one of those
 * domains does not match the registered application identity,
 * com.foreperformancesystems.forge -- note "fore", not "forge". A user who
 * writes to the wrong one gets no reply, and a rights request under a privacy
 * statute that goes unanswered is a compliance failure rather than a typo.
 *
 * Interpolate this rather than typing an address into a document. A test
 * asserts the published documents carry this and nothing else, which is the
 * part that keeps a fourth address from appearing later.
 *
 * Changing it: this is the address on documents people have ALREADY agreed to
 * (every terms consent record snapshots the document text as it stood). Point
 * the new address at the old mailbox before changing it here, or the record
 * names a way to reach Forge that no longer works.
 */
export const FORGE_CONTACT_EMAIL = "forgeperformancesystems@outlook.com";

/** Forge's registered business address.
 *
 * The unit number matters and was missing at first: the software licence
 * agreement gives the street without it, the liability waiver gives "D-237", and
 * the waiver is right (confirmed by Scott, 2026-09-16). Mail to the street alone
 * reaches a building, not Forge. Since these documents exist so somebody can
 * actually make a request or serve a notice, an address that nearly works is the
 * failure this constant was created to prevent. None of the user-facing documents carried a postal
 * address before, and two things want one: Apple expects a developer name and
 * address in a custom EULA, and a privacy policy that names only an inbox gives
 * a reader no way to serve anything or verify who they are dealing with.
 *
 * Single-line form, for interpolating into a sentence. The documents are plain
 * text with no layout, so a block address would need its own line breaks in
 * every place it appears.
 */
export const FORGE_POSTAL_ADDRESS = "5145 North 7th Street, D-237, Phoenix, Arizona 85014";

/** The legal entity. Spelled once so a document cannot quietly disagree with the
 * others about who the counterparty is. */
export const FORGE_LEGAL_ENTITY = "Forge Performance Systems LLC";

/** Governing law and venue, identical in every document.
 *
 * Arizona was already the choice in the terms-of-service draft, and the executed
 * software licence agreement independently says Arizona, so this is matching an
 * existing decision rather than making a new one.
 *
 * WHAT THIS DELIBERATELY DOES NOT INCLUDE is binding arbitration or a class-action
 * waiver. The terms draft used to propose both, with its own note that the carve-out
 * for under-18s was unconfirmed and that state law on arbitration involving minors
 * varies. That proposal has since been DROPPED rather than adopted: /terms became a
 * public page serving the terms document, so "a proposal in a document nobody has
 * been shown" stopped being true, and a reader of that page was being told
 * arbitration while the agreement they accept at signup said courts. Adding a
 * consumer's waiver of court access and of class participation to a live clickwrap
 * is a decision for counsel, not a consistency edit -- so if it comes back it comes
 * back to every document at once. server/seed-data/arbitration-dropped.test.ts holds
 * the line; see also docs/legal-clause-revisions.md.
 *
 * Since 2026-09-19 the two documents in that account are ONE: the public Terms of
 * Service is retired and /terms serves the signup agreement itself, so there is no
 * longer a second Terms for a dispute clause to disagree with. That makes the rule
 * above easier to keep, not obsolete -- the same clause still has to match the
 * biometric consent, the assumption of risk and the Service Agreement.
 */
export const GOVERNING_LAW_CLAUSE =
  "This agreement, and any dispute arising out of it or out of your use of Forge, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both sides consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.";

/** The name of the video and biometric document, spelled once.
 *
 * The document was retitled from "Biometric Information Consent and Release" to a plain consent
 * once it became clear it releases nothing -- it takes permission to collect, and calling that a
 * release misdescribes what the person agreeing is doing. The title changed in one file; the
 * seven places that NAME the document did not, so a guardian could be shown a link reading
 * "the video and biometric release", open it, and find a document called something else. When a
 * document's name is the only handle somebody has on which paper they agreed to, two names for
 * it is a real problem, not a cosmetic one.
 *
 * So it is spelled here, and legal-document-naming.test.ts scans for the old spellings rather
 * than trusting anybody to grep. The old names stay readable in the migration lanes
 * (shipped-versions.ts, LIVE_DOCUMENT_PATCHES, BIOMETRIC_WAIVER_DRAFT), which have to match
 * historical text byte-for-byte and are exempt by that scan on purpose.
 *
 * The `biometric_waiver` DOC TYPE keeps its name: it is a database enum value with rows pointing
 * at it, and renaming a stored key to fix a display string is how you turn a naming problem into
 * a data problem. */
export const BIOMETRIC_DOCUMENT_NAME = "Video and Biometric Consent";

/** The same name lowercased, for use mid-sentence in prose. */
export const BIOMETRIC_DOCUMENT_NAME_INLINE = "video and biometric consent";
