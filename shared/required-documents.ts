import { externalWaiverKindEnum } from "./schema";

export type DocumentKind = (typeof externalWaiverKindEnum.enumValues)[number];

/** SAME MECHANICS, DIFFERENT PAPERWORK.
 *
 * One upload-and-review flow serves three people who are being asked completely different
 * questions, and flattening them into one checklist would ask every one of them for two things
 * that cannot apply:
 *
 * - A ROSTERED ATHLETE trains under a school or club, which already ran its own participation
 *   waiver and medical clearance. Those are the two worth having.
 * - A FREE AGENT has no institution. Nobody issued them a participation waiver and asking for
 *   one produces a permanently red row they can never clear. What still matters for someone
 *   training alone is clearance: whether training is safe for them does not depend on who,
 *   if anyone, is watching.
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

/** NO EMERGENCY CONTACT OR TREATMENT AUTHORIZATION, deliberately, and it was on this list once.
 *
 * A treatment authorization exists so that somebody PHYSICALLY PRESENT with a child can consent
 * to treatment when the guardian cannot be reached. Forge is never present -- no staff, no
 * supervised session, nobody watching a lift in real time, which is the central claim of the
 * assumption-of-risk release rather than an incidental fact about it. There is nobody on Forge's
 * side for that authority to run to, and a clickwrap record in this database is not something
 * anyone can hand a paramedic.
 *
 * The contact details fail for a nearer reason: a rostered athlete's coach already holds them
 * from the club's own form, so a second copy here is not another number, it is a number that can
 * go stale -- and a stale emergency contact is worse than none, because somebody trusts it on
 * the day it matters. A free agent trains alone; there is no path by which Forge places a call.
 *
 * And it is a THIRD PARTY'S personal data. The contact never signed up for Forge, never agreed
 * to anything and cannot ask for their number back. Holding that indefinitely, on a platform
 * whose users include children, with no operational path that would ever read it, is a liability
 * rather than a record.
 *
 * The `emergency_authorization` enum value stays in schema.ts: uploads already made keep their
 * kind, and waiver-reader can still classify one somebody sends anyway. It is simply not asked
 * for. (Scott, 2026-09-17: "if they are being coached by an actual coach, the coach knows who
 * to call.") */
const ATHLETE_SHARED: RequiredDocument[] = [
  {
    kind: "medical_clearance",
    label: "Medical clearance to participate",
    required: true,
    why: "A physician's sign-off that training is safe. Forge asks nothing about this at signup, so if it exists it only exists here.",
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

/** How long before an expiry date a document starts asking to be renewed.
 *
 * A clearance that lapses tonight and is noticed tomorrow is the same as never having had one:
 * the gap is on the day it matters. Thirty days is enough to book a physical or re-run a
 * background check without it being so early that the warning becomes wallpaper.
 */
export const EXPIRY_WARNING_DAYS = 30;

export type DocumentStatus =
  | "missing"
  | "pending_review"
  | "accepted"
  | "rejected"
  | "expiring_soon"
  | "expired";

/** The single rule for "where does this document stand", shared by the athlete's own checklist
 * and the coach's roster view.
 *
 * It lives here rather than in storage.ts because two screens that answer the same question
 * differently is how a coach comes to believe an athlete is covered when their own page says
 * otherwise. Pure, so it is tested without a database.
 *
 * `today` and `expiresOn` are both plain YYYY-MM-DD. Compared as strings on purpose -- an ISO
 * date sorts lexicographically, and parsing them into Date objects is how a document expires a
 * day early for somebody in a different time zone.
 */
export function documentStatus(
  current: { reviewStatus: string; expiresOn?: string | null } | undefined,
  today: string,
): DocumentStatus {
  if (!current) return "missing";
  if (current.expiresOn) {
    if (current.expiresOn < today) return "expired";
    if (current.expiresOn <= addDays(today, EXPIRY_WARNING_DAYS)) return "expiring_soon";
  }
  if (current.reviewStatus === "accepted") return "accepted";
  if (current.reviewStatus === "rejected") return "rejected";
  return "pending_review";
}

/** YYYY-MM-DD plus n days, via UTC so it cannot be shifted by the server's own zone. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Does this status need somebody to do something? Expired and expiring count; a rejection
 * counts because the upload has to be replaced. */
export function documentNeedsAction(status: DocumentStatus): boolean {
  return status !== "accepted" && status !== "pending_review";
}
