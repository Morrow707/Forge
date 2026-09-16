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
