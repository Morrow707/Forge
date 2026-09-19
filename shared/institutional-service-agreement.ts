import { z } from "zod";

/** THE INSTITUTIONAL SERVICE AGREEMENT, AS A SCHOOL RECEIVES IT.
 *
 * NAME REFERENCE UPDATED 2026-09-19: s1.2's list of User Documents said "the Terms of Service",
 * a document retired that day when the two Terms were merged. It now says "the Terms of Use",
 * which is what every person under the Institution's program actually accepts. Nothing else in
 * this contract changed. It changes the text hash stored on signatures made from here on, which
 * is what that hash is for; copies already signed are untouched.
 *
 * `docs/institutional-service-agreement.md` used to be the only copy, which meant a school got
 * its agreement by Scott opening that file, deleting the review marks, typing the school's name
 * into six places and mailing a PDF. This module is that text as data so the app can do it.
 *
 * Two things are deliberately true of the text in here:
 *
 * 1. **It carries no review marks.** The `[FOR SCOTT]` and `[FOR COUNSEL]` notes in the doc file
 *    were addressed to Scott and to the attorney, not to a school, and a school that receives
 *    one is reading a draft with its editor's margin notes still in it. The DEFAULTS those notes
 *    were about (72-hour incident notice, 30-day export window, $1,000 liability cap) are the
 *    agreement's actual terms and stay exactly as they were.
 * 2. **It contains no blanks.** Everything that used to be a `[BLANK ...]` mark is a field:
 *    the Institution's side comes from the coach filling in the form, Forge's side is supplied
 *    by the server. A rendered agreement is complete or it is not rendered.
 *
 * `shared/institutional-service-agreement.test.ts` enforces both, and asserts the doc file still
 * contains every section verbatim so the contract text cannot drift between the two.
 */

export interface InstitutionalAgreementSection {
  /** "1. WHAT THIS AGREEMENT COVERS" -- the number is part of the heading, as it is in the doc. */
  heading: string;
  /** Each numbered clause, whole, in order. */
  paragraphs: string[];
}

export const INSTITUTIONAL_AGREEMENT_TITLE =
  "FORGE PERFORMANCE SYSTEMS -- INSTITUTIONAL SERVICE AGREEMENT";

export const INSTITUTIONAL_AGREEMENT_PREAMBLE =
  'This Institutional Service Agreement (the "Agreement") is between Forge Performance Systems LLC, an Arizona limited liability company with its principal office at 5145 North 7th Street, D-237, Phoenix, Arizona 85014 ("Forge"), and the organization named below (the "Institution"). It takes effect on the Effective Date below.';

/** What goes in the PLAN line. The plan is chosen in the app and can change without the contract
 * being re-signed, so the agreement points at the Service rather than naming a tier that would be
 * stale the first time a school moves between athlete bands. */
export const INSTITUTIONAL_AGREEMENT_PLAN = "as selected in the Service from time to time";

export const INSTITUTIONAL_AGREEMENT_SECTIONS: InstitutionalAgreementSection[] = [
  {
    heading: "1. WHAT THIS AGREEMENT COVERS",
    paragraphs: [
      '1.1 Forge provides a strength and conditioning platform (the "Service") through which coaches program training for a roster of athletes, athletes log their training on their own devices, and the Service can measure movement from video an athlete records on their own phone.',
      '1.2 This Agreement governs the Institution\'s use of the Service on an organizational plan. It sits on top of, and does not replace, the documents each individual person accepts when they use the Service: the Terms of Use, the Privacy Policy, the End User License Agreement, the Video and Biometric Consent, the Assumption of Risk, the AI Terms of Use and, for a minor, the Notice to Parent or Guardian (together the "User Documents"). Every coach, staff member, athlete and guardian using the Service under the Institution\'s program accepts the User Documents individually, and this Agreement does not waive or alter anything they accepted.',
      "1.3 If this Agreement and a User Document conflict on a matter between Forge and the Institution, this Agreement governs. On a matter between Forge and an individual user, the User Document governs. Nothing in this Agreement reduces a right the Privacy Policy or a consent document gives to an athlete or a parent.",
    ],
  },
  {
    heading: "2. AUTHORITY",
    paragraphs: [
      "2.1 The person signing for the Institution represents that they are authorized to bind it. If the Institution is a public school or district, that person represents that any approval its governing body or procurement rules require has been obtained.",
    ],
  },
  {
    heading: "3. ACCOUNTS AND ROSTER",
    paragraphs: [
      "3.1 The Institution designates one or more coaches as its primary contacts in the Service. Coaches may add assistant coaches and staff, who share the roster. The Institution is responsible for the people it authorizes and for removing access when a coach or staff member leaves.",
      "3.2 Athletes join the Institution's roster by an invitation or code the Institution's coaches issue. The Institution will issue codes only to its own athletes.",
      "3.3 Each person must keep their own login private. The Service asks for confirmation from an account's email address when it is used from a device it has not seen before; the Institution will not instruct anyone to share credentials or to bypass that step.",
    ],
  },
  {
    heading: "4. ATHLETES UNDER 18",
    paragraphs: [
      "4.1 How the Service handles minors. An account for an athlete under 18 does not function until a parent or legal guardian has claimed a linked guardian account through the link the Service emails them and has accepted the Notice to Parent or Guardian, the Video and Biometric Consent, the Assumption of Risk and the Privacy Policy. The Service records the exact text accepted and when. For an athlete under 13, camera tracking stays off until the guardian turns it on. The Institution acknowledges that this gate is enforced by the Service and cannot be bypassed by a coach.",
      "4.2 The Institution's duties. Because the gate depends on reaching the right parent, the Institution will (a) provide, or have the athlete provide, a current email address for the athlete's parent or legal guardian and not for anyone else; (b) not represent to Forge that a person is a parent or guardian when they are not; (c) obtain and keep any consent, authorization or waiver that the Institution's own policies, its governing body, its athletic association or applicable law require of the Institution for its athletes' participation in its program, independently of the Service; and (d) tell Forge promptly if it learns that a guardian consent recorded in the Service was given by someone without authority.",
      "4.3 Allocation. Forge is responsible for obtaining and recording the parent or guardian's consent to the Service's own collection and use of the athlete's information, through the gate in Section 4.1. The Institution is responsible for the accuracy of the guardian contact it supplies and for the consents in Section 4.2(c). Neither party is responsible for the other's part.",
    ],
  },
  {
    heading: "5. THE INSTITUTION'S DATA",
    paragraphs: [
      '5.1 Ownership. As between Forge and the Institution, information about the Institution\'s athletes and staff entered into or generated by the Service under the Institution\'s program ("Institution Data") belongs to the Institution and its athletes, subject to each athlete\'s own rights under the User Documents. Forge receives only the license it needs to provide the Service.',
      "5.2 What Forge receives. Athlete name, email, date of birth, sport, position, height and weight; training programs and logged training; wellness self-reports; nutrition an athlete chooses to log; camera-derived movement measurements and, only when an athlete chooses to save it, the video itself; and, if an athlete turns it on, readings from Apple Health. Forge does not receive grades, transcripts, disciplinary records, medical records held by the Institution, or any other education record. The Institution will not upload such records to the Service.",
      "5.3 Documents the Institution uploads. Where a coach uploads a document about an athlete (for example a medical clearance or an emergency authorization), the Institution represents that it holds that document lawfully and is permitted to store it with Forge. Such documents are retained and deleted on the same terms as the athlete's other data.",
      "5.4 What Forge does with it. Forge uses Institution Data only to provide the Service to the Institution and its users, to secure and support the Service, and for platform-level analytics from which names, emails and team affiliation have been removed. Forge does not sell Institution Data, does not use it for advertising, and does not share it with any third party except the processors in Section 5.5 and as required by law.",
      "5.5 Processors. Forge uses the following third parties to run the Service and will not add one that receives Institution Data without updating the Privacy Policy: Render (hosting and database, United States); Anthropic (AI features; receives the text of a request at the moment it is made and does not retain it to train models); Resend (email); Apple and Google (app distribution and push notifications); Stripe (payments on the web); Sentry (error reporting); an IP geolocation lookup (approximate sign-in location shown to the user); and public food databases (nutrition lookups). Forge remains responsible to the Institution for its processors.",
      "5.6 Research use. Forge prepares de-identified group statistics for research only for athletes whose parent or guardian, or the athlete if 18 or over, has separately opted in. The Institution's signature does not opt anyone in, and the Institution cannot opt an athlete in on their behalf.",
      "5.7 Security. Forge protects Institution Data with encrypted connections, access controls, encryption of sensitive fields at rest, and a log of every occasion on which Forge staff or a coach opens an individual athlete's video or record. Forge will notify the Institution's notice address without undue delay, and in any case within 72 hours of confirming it, of any security incident that Forge determines has resulted in unauthorized access to Institution Data, with the information the Institution needs to meet its own obligations.",
      "5.8 Retention and deletion. Raw video of an athlete under 13 is deleted 30 days after it was recorded and of an athlete aged 13 to 17 after 90 days; the Institution may set a shorter limit for its own athletes in the Service. Numeric measurements are kept as part of the athlete's training record. When an athlete or guardian deletes an account, its data is permanently removed. On termination of this Agreement, Forge will make Institution Data available for export for 30 days and then delete it, except where an individual athlete keeps their own account under the User Documents or where law requires retention.",
      "5.9 Access requests. Forge will pass to the Institution any request it receives from an athlete or parent that the Institution is the right party to answer, and will support the Institution in answering requests that Forge is the right party to answer.",
    ],
  },
  {
    heading: "6. EDUCATION RECORDS",
    paragraphs: [
      "6.1 The information in Section 5.2 is directory information of the kind institutions disclose about their athletes routinely, and the Service is not designed to receive education records. This Agreement does not make Forge a school official, and Forge does not claim the school-official exception, under the Family Educational Rights and Privacy Act or any similar law. If the Institution determines that its use of the Service requires a data-processing agreement or a school-official addendum, the parties will negotiate one in writing and it will take precedence over this Section.",
    ],
  },
  {
    heading: "7. FEES",
    paragraphs: [
      "7.1 The fees for the Institution's plan are those shown in the Service for the plan and athlete band selected, billed monthly to the payment method on file, plus any add-ons the Institution selects. Fees exclude taxes; the Institution is responsible for sales, use and similar taxes other than taxes on Forge's income. If the Institution is tax-exempt, it will provide its exemption certificate.",
      "7.2 During Forge's beta period no fees are charged. Forge will give at least 30 days' written notice before fees begin and before any price change, and the Institution may terminate under Section 8 before the change takes effect.",
      "7.3 Purchases an individual athlete makes for their own account through the Apple App Store are between that athlete and Apple and are not fees under this Agreement.",
    ],
  },
  {
    heading: "8. TERM AND TERMINATION",
    paragraphs: [
      "8.1 This Agreement begins on the Effective Date and continues until terminated. Either party may terminate for convenience on 30 days' written notice. Either party may terminate immediately on written notice if the other materially breaches this Agreement and does not cure within 15 days of notice, or if the other becomes insolvent.",
      "8.2 Forge may suspend access, with notice, where continued access would present a security or legal risk to the Service or its users, and will restore it as soon as the risk is resolved.",
      "8.3 On termination, Section 5.8 governs data. Sections 5, 6, 9, 11, 12, 13, 14 and 15 survive termination.",
    ],
  },
  {
    heading: "9. USE OF THE SERVICE",
    paragraphs: [
      "9.1 The Institution will use the Service only for its own athletic program and in accordance with the User Documents. It will not permit anyone to scrape, copy or extract the Service's exercise library or software, attempt to re-identify an individual from any de-identified figure the Service shows, or use the Service to access data of any athlete outside its own roster.",
      "9.2 The Institution is responsible for supervising its athletes' training. Forge is not present at any session and does not supervise, instruct or evaluate any athlete.",
    ],
  },
  {
    heading: "10. CAMERA MEASUREMENTS",
    paragraphs: [
      "10.1 The Service can record video of a lift and calculate numbers from it: bar speed, range of motion, jump height, sprint time, bar path and similar figures. Video recording, playback and coach review work as described. The numbers calculated from video are estimates that depend on filming conditions and, at the Effective Date, have been validated against instrumented reference measurements for only a limited set of movements, which Forge publishes in the Service. Forge does not warrant their accuracy.",
      "10.2 The Institution will not use a camera-derived number as the sole basis for a decision about an athlete's eligibility, selection, playing time, injury status or return to play. The Service displays a notice to this effect wherever such a number is shown, and the Institution will not disable or instruct anyone to disregard it.",
    ],
  },
  {
    heading: "11. WARRANTIES AND DISCLAIMER",
    paragraphs: [
      "11.1 Forge warrants that it will provide the Service with reasonable skill and care, substantially as described in the User Documents, and in compliance with the laws that apply to Forge as a provider of the Service. The Institution warrants that it has the authority to provide the data it provides and that its use of the Service complies with the laws that apply to it.",
      "11.2 Except as stated in this Section, the Service is provided as is. Forge disclaims all other warranties, express or implied, including fitness for a particular purpose, and does not warrant that the Service will be uninterrupted or error-free. Athletic training carries an inherent risk of injury that the Service does not create or remove; the Assumption of Risk each athlete or guardian accepts applies.",
    ],
  },
  {
    heading: "12. LIMITATION OF LIABILITY",
    paragraphs: [
      "12.1 Neither party is liable to the other for indirect, incidental, consequential, special or punitive damages, or for lost profits or revenue, arising out of this Agreement, however caused.",
      "12.2 Each party's total liability to the other arising out of this Agreement is limited to the fees paid or payable by the Institution to Forge in the twelve months before the event giving rise to the claim, or, if no fees have been paid, to one thousand US dollars.",
      "12.3 The limits in this Section do not apply to a party's indemnification obligations under Section 13, to a breach of Section 5 (Institution Data) or Section 14 (Confidentiality), to a party's gross negligence or willful misconduct, or to any liability that cannot lawfully be limited.",
    ],
  },
  {
    heading: "13. INDEMNIFICATION",
    paragraphs: [
      "13.1 By the Institution. The Institution will defend Forge and its officers, employees and affiliates against, and pay any resulting damages, costs and reasonable attorneys' fees from, a third-party claim arising out of (a) the Institution supplying a guardian contact that did not belong to the athlete's parent or legal guardian, or representing that a person was a parent or guardian when they were not; (b) the Institution's failure to obtain a consent, authorization or waiver that Section 4.2(c) makes its responsibility; (c) a document the Institution uploaded that it was not entitled to hold or share; (d) the Institution's supervision of, or decisions about, its athletes; or (e) the Institution's use of the Service in breach of this Agreement or applicable law.",
      "13.2 By Forge. Forge will defend the Institution and its officers, employees and board against, and pay any resulting damages, costs and reasonable attorneys' fees from, a third-party claim arising out of (a) an allegation that the Service, used as permitted by this Agreement, infringes that third party's intellectual property rights; or (b) a security incident described in Section 5.7 that resulted from Forge's breach of this Agreement.",
      "13.3 Procedure. The indemnified party will give prompt notice of the claim, allow the indemnifying party to control the defense and settlement, and cooperate reasonably. The indemnifying party will not settle a claim in a way that admits fault on behalf of, or imposes an obligation on, the indemnified party without its written consent, not to be unreasonably withheld.",
      "13.4 Public institutions. Where the Institution is a public school, district or other public body whose law prohibits it from agreeing to indemnify, Section 13.1 applies only to the extent that law permits, and the Institution's obligations under Section 4.2 remain in full.",
    ],
  },
  {
    heading: "14. CONFIDENTIALITY",
    paragraphs: [
      "14.1 Each party will keep confidential any non-public information it receives from the other under this Agreement, use it only for this Agreement, and protect it with at least the care it uses for its own confidential information. Institution Data is the Institution's confidential information. This Section does not apply to information that is public through no fault of the receiving party or that the receiving party is required by law to disclose, provided it gives notice where lawful. A public Institution's disclosure obligations under public-records law are not a breach of this Section.",
    ],
  },
  {
    heading: "15. GOVERNING LAW AND DISPUTES",
    paragraphs: [
      "15.1 This Agreement, and any dispute arising out of it, is governed by the laws of the State of Arizona, without regard to its conflict-of-laws provisions. The parties will first try to resolve any dispute by talking to each other; a party may request a meeting of senior representatives, to be held within 30 days. Anything not resolved that way lies in the state and federal courts located in Maricopa County, Arizona, and both parties consent to the jurisdiction of those courts. Nothing here waives a right that cannot lawfully be waived, including a right belonging to a person under 18 or a sovereign or governmental immunity the Institution holds by law.",
    ],
  },
  {
    heading: "16. GENERAL",
    paragraphs: [
      "16.1 Entire agreement. This Agreement, the plan selected in the Service, and the User Documents as they apply to individuals, are the entire agreement between the parties about the Service. Purchase-order terms or other Institution forms do not apply unless Forge signs them.",
      "16.2 Changes. Forge may update the User Documents as described in them. Changes to this Agreement require a signed writing, except that Forge may update Section 5.5 by updating the Privacy Policy and giving the Institution 30 days' notice.",
      "16.3 Assignment. Neither party may assign this Agreement without the other's written consent, except to a successor to substantially all of its business, on notice.",
      "16.4 Notices. Notices under this Agreement go by email to the addresses in this Agreement, with a copy by mail for a notice of breach or termination, and are effective on receipt.",
      "16.5 Independent parties. The parties are independent contractors. Nothing here creates a partnership, agency or employment relationship.",
      "16.6 Signatures. This Agreement may be signed electronically and in counterparts.",
    ],
  },
];

/** THE SCHOOL'S SIDE OF THE HEADER BLOCK.
 *
 * The messages are written for the coach who is filling this in on a phone in a weight room, not
 * for a developer reading a stack trace: every one of them says what to type, not which rule was
 * violated. `.trim()` runs before every length check so a stray space cannot pass for a name, and
 * the trimmed value is what gets printed into the contract.
 */
export const institutionalAgreementFormSchema = z.object({
  institutionName: z
    .string({ required_error: "Enter the full legal name of your school, district or club." })
    .trim()
    .min(2, "Enter the full legal name of your school, district or club.")
    .max(200, "That name is too long -- use the legal name, up to 200 characters."),
  address: z
    .string({ required_error: "Enter the mailing address where notices should be sent." })
    .trim()
    .min(5, "Enter the mailing address where notices should be sent.")
    .max(300, "That address is too long -- keep it under 300 characters."),
  signerName: z
    .string({ required_error: "Enter the name of the person who will sign this." })
    .trim()
    .min(2, "Enter the name of the person who will sign this.")
    .max(120, "That name is too long -- keep it under 120 characters."),
  signerTitle: z
    .string({ required_error: "Enter that person's job title, for example Athletic Director." })
    .trim()
    .min(2, "Enter that person's job title, for example Athletic Director.")
    .max(120, "That title is too long -- keep it under 120 characters."),
  noticeEmail: z
    .string({ required_error: "Enter an email address for legal notices." })
    .trim()
    .email("That doesn't look like an email address -- check for a typo."),
});

export type InstitutionalAgreementForm = z.infer<typeof institutionalAgreementFormSchema>;

/** Forge's side of the header and signature blocks. The server supplies it (the signer's name
 * and title come from the environment) so this module stays free of process.env. */
export interface InstitutionalAgreementForgeSide {
  signerName: string;
  signerTitle: string;
  /** Date of generation, already formatted for print. */
  effectiveDate: string;
}

export interface InstitutionalAgreementHeaderField {
  label: string;
  value: string;
}

/** The labelled lines above Section 1, in the order they are printed. */
export function institutionalAgreementHeaderFields(
  institution: InstitutionalAgreementForm,
  forge: InstitutionalAgreementForgeSide,
): InstitutionalAgreementHeaderField[] {
  return [
    { label: "INSTITUTION", value: institution.institutionName },
    { label: "ADDRESS", value: institution.address },
    {
      label: "AUTHORIZED REPRESENTATIVE",
      value: `${institution.signerName}, ${institution.signerTitle}`,
    },
    { label: "NOTICES TO THE INSTITUTION", value: institution.noticeEmail },
    { label: "EFFECTIVE DATE", value: forge.effectiveDate },
    { label: "PLAN", value: INSTITUTIONAL_AGREEMENT_PLAN },
  ];
}

/** The whole agreement as plain text -- what the preview route returns, and what the PDF lays
 * out. One renderer so the thing a coach reads on screen and the thing they sign cannot differ. */
export function renderInstitutionalAgreementText(
  institution: InstitutionalAgreementForm,
  forge: InstitutionalAgreementForgeSide,
): string {
  const lines: string[] = [INSTITUTIONAL_AGREEMENT_TITLE, "", INSTITUTIONAL_AGREEMENT_PREAMBLE, ""];
  for (const field of institutionalAgreementHeaderFields(institution, forge)) {
    lines.push(`${field.label}: ${field.value}`);
  }
  for (const section of INSTITUTIONAL_AGREEMENT_SECTIONS) {
    lines.push("", section.heading);
    for (const paragraph of section.paragraphs) lines.push(paragraph);
  }
  lines.push(
    "",
    "SIGNED",
    "",
    "FORGE PERFORMANCE SYSTEMS LLC",
    "By: ______________________________",
    `Name: ${forge.signerName}`,
    `Title: ${forge.signerTitle}`,
    `Date: ${forge.effectiveDate}`,
    "",
    "THE INSTITUTION",
    "By: ______________________________",
    `Name: ${institution.signerName}`,
    `Title: ${institution.signerTitle}`,
    "Date: ____________",
  );
  return lines.join("\n");
}
