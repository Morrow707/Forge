/** The Artificial Intelligence Terms of Use, second revision, 2026-09-17. VERBATIM.
 *
 * Generated on Rocket Lawyer, then revised by Scott against the four conflicts the first version
 * carried. All four are genuinely fixed rather than softened:
 *
 *   - The entire-agreement clause now names its survivors -- the signup agreement, the
 *     Assumption of Risk and Release, the Video and Biometric Information Release and the
 *     Privacy Policy all remain in force. The first version carved out only the privacy policy,
 *     so accepting it could have been argued to supersede Forge's only two instruments where
 *     somebody gives up a right or grants a consent.
 *   - Data Protection points at the published Privacy Policy instead of an "internal Data
 *     Protection Policy" that does not exist.
 *   - The age rule matches the product. It took two passes: the second revision said 13 to
 *     register independently, with under-13s going through a coach. Scott caught that, and he
 *     was right twice over. NOBODY under 18 can use Forge independently -- the guardian gate
 *     holds every minor's account until a guardian claims their own linked one, whatever age
 *     they are. And an under-13 CAN sign themselves up; the route stopped refusing them
 *     precisely because refusing left a twelve-year-old with no coach no way in at all. The
 *     clause now says what section 3 of the live signup agreement says, because they are
 *     describing the same gate.
 *   - Output derived from a User's own data is the User's. The first version gave the Company
 *     ownership of it and forbade distribution, under which a coach emailing an athlete their
 *     AI-drafted block was a breach.
 *
 * It also now carries the Maricopa County venue and the conflict-of-laws language, matching
 * GOVERNING_LAW_CLAUSE, and the ADR section is mediation before litigation -- no binding
 * arbitration, no class-action waiver.
 *
 * THIRD REVISION CLOSES THE LAST THREE. The indemnification clause now falls on the parent or
 * guardian where the User is under 18, and only so far as the law allows. The minor-rights
 * carve-out that every other Forge document carries -- "Nothing here waives a right that cannot
 * lawfully be waived, including a right belonging to a person under 18" -- is in the governing
 * law section, verbatim, so all five documents match. And "Service" is defined against Forge
 * rather than assumed: the AI features specifically, with platform use pointed back at the
 * signup agreement. That last one is what makes this a supplement rather than a rival -- it does
 * a job the signup agreement does not, and its entire-agreement clause now only ever reaches the
 * AI features.
 *
 * STILL NOT WIRED TO ANYTHING, and a test holds it there. Not because anything in it is wrong
 * now, but because publishing a document people are bound by is its own decision: it needs a
 * legalDocuments type, a migration, a public route, and a consent record with the text
 * snapshotted, the same as every other live document here. Nothing is half-applied in the
 * meantime.
 */
export const AI_TERMS_OF_USE = `Artificial Intelligence Terms of Use

Acceptance of the Terms of Use. This Artificial Intelligence Terms of Use ("Terms") is made effective as of September 17, 2026, by and between you ("User") and Forge Performance Systems LLC ("Company"). "Service" means the artificial intelligence features within the Forge platform, including AI program generation, AI form-check feedback, and the AI coaching assistant. Use of the Forge platform generally is governed by the Forge signup agreement. By accessing and using the Service, the User acknowledges that the User has read, understood, and agreed to be bound by the following Terms and the Company Privacy Policy. If the User does not agree to these Terms, the User may not use the Service.

Age Requirements. A User who is 18 or older may register and use the Service on their own. An athlete under 18 may not use the Service until a parent or legal guardian has their own linked Forge account and has agreed on the athlete's behalf. This is enforced by the software, not merely requested: the account is held and cannot be used until that has happened. It applies to every athlete under 18 however they arrived -- signing up alone, provisioned by a coach, or moved between teams. For an athlete under 13, camera tracking stays off until their guardian turns it on, and research consent is never given by the athlete.

Use of Services. The User agrees to use the Service only for lawful purposes and in compliance with all applicable laws and regulations. By using the Service, the User agrees not to engage in any activities that:

(a) Violate any applicable federal, state, local, or international laws or regulations, including those pertaining to the export of data or software to and from the United States or other countries.
(b) Involve the transmission or solicitation of advertising or promotional material, including "junk mail," "chain letters," "spam," or any similar form of solicitation, unless the User has obtained the Company's prior written consent.
(c) Impersonate or attempt to impersonate the Company, a Company employee, another user, or any other person or entity, including using email addresses associated with any of the aforementioned parties.
(d) Engage in any conduct that limits or inhibits the use or enjoyment of the Service by others or may harm the Company and its users or expose the Company to legal liability.
(e) Interfere with or disrupt the functioning of the Service or violate the rights of others.
(f) Use the Service to develop competing machine learning models or related technology.

Content. The insights produced and provided by the Service ("Output") are derived from processed movement, athletic, and system metadata on the platform ("Input"). Both the Input and Output are collectively referred to as "Content." The responsibility for ensuring that the Content adheres to relevant laws and these Terms rests solely with the User. Given the nature of machine learning, the Output may not be exclusive, and the Service might produce similar or identical results for other users.

Intellectual Property. All intellectual property rights related to the Service -- including but not limited to the underlying software, machine learning models, algorithms, programming, visual interfaces, and trademarks -- are owned by or licensed to the Company. Output generated for a User derived from that User's own input data is owned by the User for their personal or athletic coaching use. The User may not copy, modify, reverse engineer, or distribute the Service itself, or reproduce any part of the platform without the Company's prior written consent.

Privacy. The Company believes strongly in the protection of privacy. Personal data processed through the Service may be collected, accessed, and stored by the Company in accordance with applicable privacy laws. By using the Service, the User agrees to the terms of the Company's Privacy Policy, which can be found on the Company website.

Data Protection. Data collection and the use of data collected by the Service are governed by the Company's Privacy Policy.

Accuracy and Limitation of Liability. The Service is provided on an "as is" basis, and the Company makes no warranties or representations regarding its accuracy, reliability, or suitability for any athletic or legal purpose. The User accepts that the Company is not liable for Content quality failures related to inaccurate data, tracking performance failures, or other quality-based issues. The Company shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising from or in connection with using the Service. The information provided by the Service is intended for general informational and athletic training guidance purposes only. Any reliance the User places on such information is done strictly at the User's own risk.

Indemnification. The User agrees to indemnify and hold the Company harmless from all claims, losses, expenses, and fees, including attorney fees, costs, and judgments that may be asserted against the Company resulting from any act or omission of the User and their employees, agents, or representatives. Where the User is under 18, this obligation is undertaken by the parent or legal guardian who permitted their use of the Service, and only to the extent permitted by applicable law.

Termination. The Company reserves the right to suspend or terminate the User's access to the Service at any time without prior notice for any reason, including but not limited to violation of these Terms.

Amendment. The Company reserves the right to change these Terms from time to time. All changes are effective immediately and apply to all access to and use of the Service. The User's continued use of the Service after such modifications will constitute the User's (a) acknowledgment of the modified Terms and (b) agreement to abide and be bound by the Terms.

Alternative Dispute Resolution. The parties will attempt to resolve any dispute arising out of or relating to this agreement through friendly negotiations among the parties. If the matter is not resolved by negotiation, the parties agree to try in good faith to settle the dispute by mediation in accordance with statutory rules of mediation before pursuing formal litigation.

Governing Law and Jurisdiction. All matters relating to the Company, these Terms, and any dispute or claim arising therefrom or related thereto shall be governed by and construed in accordance with the laws of the State of Arizona, without giving effect to any choice or conflict of law provision. Any legal suit, action, or proceeding arising out of or related to these Terms or the Service shall be instituted exclusively in the state or federal courts located in Maricopa County, Arizona. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18.

Entire Agreement. These Terms constitute the entire understanding between the User and the Company with respect to the Service and supersede all prior or contemporaneous understandings and agreements, whether written or oral, with respect to the Service, except the Forge signup agreement, the Assumption of Risk and Release, the Video and Biometric Information Release, and the Privacy Policy, each of which remains in full force and effect.

Headings. Headings used in these Terms are provided for convenience only and shall not be used to construe meaning or intent.

Disclaimer. The Service utilizes machine-learning technology, and the User should use discretion before relying on, publishing, or using Content generated by the Service. The information provided by the Service is intended for general informational and performance tracking purposes only. The Company makes no guarantees regarding the accuracy, completeness, or usefulness of this information.

Contact Information

Forge Performance Systems LLC welcomes questions or comments regarding these Terms:

Forge Performance Systems LLC
5145 North 7th Street, D-237
Phoenix, Arizona 85014
Email: forgeperformancesystems@outlook.com`;
