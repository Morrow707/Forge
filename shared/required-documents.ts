import { externalWaiverKindEnum } from "./schema";

export type DocumentKind = (typeof externalWaiverKindEnum.enumValues)[number];

/** SAME MECHANICS, DIFFERENT PAPERWORK.
 *
 * One upload-and-review flow serves three people who are being asked completely different
 * questions, and flattening them into one checklist would ask every one of them for two things
 * that cannot apply:
 *
 * - A ROSTERED ATHLETE trains under a school or club, which already ran its own participation
 *   waiver, medical clearance and emergency form. Those are the three worth having.
 * - A FREE AGENT has no institution. Nobody issued them a participation waiver and asking for
 *   one produces a permanently red row they can never clear. What still matters for someone
 *   training alone is clearance and a contact in an emergency.
 * - A COACH is not being cleared to participate, they are being cleared to SUPERVISE. Their
 *   documents are credentials -- certification, background check, CPR, insurance -- and calling
 *   any of that a "waiver" would be wrong in a way that matters if anyone ever reads this list.
 *
 * Declared once, here, so the checklist a person sees and the checklist anything server-side
 * reasons about cannot drift apart.
 */
export type DocumentAudience = "athlete_rostered" | "athlete_free_agent" | "coach";

export type RequiredDocument = {
  kind: DocumentKind;
  label: string;
  /** Required rows show a red cross until they are on file. Recommended rows show a muted dash,
   * because a checklist where half the items can never be satisfied teaches people to ignore
   * all of it. */
  required: boolean;
  /** One line, shown under the label. Says why it is being asked for rather than leaving the
   * person to guess, which is the difference between a form somebody fills in and one they
   * abandon. */
  why: string;
};

const ATHLETE_SHARED: RequiredDocument[] = [
  {
    kind: "medical_clearance",
    label: "Medical clearance to participate",
    required: true,
    why: "A physician's sign-off that training is safe. Forge asks nothing about this at signup, so if it exists it only exists here.",
  },
  {
    kind: "emergency_authorization",
    label: "Emergency contact & treatment authorization",
    required: true,
    why: "Who to call, and permission to seek treatment. For an athlete under 18 this is the one that matters most on the worst day.",
  },
  {
    kind: "photo_media_release",
    label: "Photo / media release",
    required: false,
    why: "Only needed if your coach or programme wants to post clips. The video release you accepted in Forge covers tracking, not publicity.",
  },
];

export const REQUIRED_DOCUMENTS: Record<DocumentAudience, RequiredDocument[]> = {
  athlete_rostered: [
    {
      kind: "participation_waiver",
      label: "Participation waiver / release of liability",
      required: true,
      why: "The one your school or club had signed at the start of the season.",
    },
    ...ATHLETE_SHARED,
  ],
  // No participation waiver: there is no institution to have issued one, and a row nobody can
  // ever satisfy is worse than no row.
  athlete_free_agent: ATHLETE_SHARED,
  coach: [
    {
      kind: "background_check",
      label: "Background check / SafeSport clearance",
      required: true,
      why: "You coach minors through Forge. This is the document a parent would ask for first.",
    },
    {
      kind: "coaching_certification",
      label: "Coaching certification",
      required: true,
      why: "Whatever your governing body issues -- USAW, NSCA, a state association card.",
    },
    {
      kind: "cpr_first_aid",
      label: "CPR / First Aid certification",
      required: true,
      why: "Usually two years, and the lapse is the part people miss. Add the expiry date and this row will tell you.",
    },
    {
      kind: "liability_insurance",
      label: "Liability insurance",
      required: false,
      why: "If you coach independently rather than under a school's policy.",
    },
  ],
};

/** Which checklist applies. A coach is a coach; an athlete splits on whether anybody actually
 * coaches them, because that is what decides whether an institution exists to have issued
 * anything. */
export function documentAudienceFor(input: {
  role: string;
  hasCoach: boolean;
}): DocumentAudience {
  if (input.role === "coach" || input.role === "admin") return "coach";
  return input.hasCoach ? "athlete_rostered" : "athlete_free_agent";
}

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  participation_waiver: "Participation waiver / release of liability",
  medical_clearance: "Medical clearance to participate",
  emergency_authorization: "Emergency contact & treatment authorization",
  photo_media_release: "Photo / media release",
  coaching_certification: "Coaching certification",
  background_check: "Background check / SafeSport clearance",
  cpr_first_aid: "CPR / First Aid certification",
  liability_insurance: "Liability insurance",
  other: "Other",
};
