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
 * From the executed software licence agreement, which is where it was first
 * written down anywhere. None of the user-facing documents carried a postal
 * address before, and two things want one: Apple expects a developer name and
 * address in a custom EULA, and a privacy policy that names only an inbox gives
 * a reader no way to serve anything or verify who they are dealing with.
 *
 * Single-line form, for interpolating into a sentence. The documents are plain
 * text with no layout, so a block address would need its own line breaks in
 * every place it appears.
 */
export const FORGE_POSTAL_ADDRESS = "5145 North 7th Street, Phoenix, Arizona 85014";

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
 * waiver. The terms draft proposes both, with its own note that the carve-out for
 * under-18s is unconfirmed and that state law on arbitration involving minors
 * varies. Adding a consumer's waiver of court access and of class participation to
 * a LIVE clickwrap is a decision for counsel, not a consistency edit, so the live
 * documents state governing law and venue and leave arbitration where it is: a
 * proposal in a document nobody has been shown. See docs/legal-clause-revisions.md.
 */
export const GOVERNING_LAW_CLAUSE =
  "This agreement, and any dispute arising out of it or out of your use of Forge, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both sides consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.";
