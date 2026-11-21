/* COACH <-> ATHLETE MESSAGING: THE RULES (2026-11-21). Pure, so `npm test` holds them with no
 * Postgres; server/coach-messages.ts reads the rows and applies them.
 *
 * Scott, 2026-10-15: "i want 0, absolute 0 communication between users when they aren't being
 * coached." So a message exists only between a coach and ONE athlete that coach currently coaches.
 * Nothing here can address an athlete to another athlete, and a Free Agent has no coach, so no
 * Free Agent can address anybody.
 *
 * THE FOUR STATES OF A THREAD (one coach, one athlete):
 *   active -- the athlete holds a current, un-parked seat on this coach's staff roster and is
 *             inside this coach's team scope (athleteIsInCoachScope). Both may read and send.
 *   held   -- in scope, but every seat they hold on this staff is parked for the off season
 *             (shared/roster-hold.ts). Old messages stay readable to both (question 2 of the hold:
 *             the coach keeps every read), and NEITHER side sends: a parked seat does not count as
 *             coached (question 4), and the coach may not put new things in front of a parked
 *             athlete (question 3).
 *   ended  -- the athlete is no longer in this coach's scope (removed from the roster, the coach
 *             left the staff, or a staff coach was narrowed to other teams), and the two exchanged
 *             messages while they were. The thread stays readable to its two parties, read-only.
 *   none   -- no relationship and no history. Nothing is readable and nothing can be sent.
 */

export const MESSAGE_MAX_LENGTH = 2000;
/** How much of a message rides in the notification. The full text is in the app. */
export const NOTIFICATION_PREVIEW_LENGTH = 140;

export type RelationshipState = "active" | "held" | "ended" | "none";

export interface CoachingRelationship {
  coachId: number;
  athleteId: number;
  state: RelationshipState;
  /** The return date of a held seat, when the coach set one. */
  heldUntil: string | null;
}

/** What `relationshipStateFrom` decides from. Every field is read off the database by the server. */
export interface RelationshipFacts {
  /** The coach row is a coach and the athlete row is an athlete, and they are two people. */
  rolesAreCoachAndAthlete: boolean;
  /** storage.athleteIsInCoachScope(coach, athlete): a current staff-roster seat, team-narrowed. */
  inScope: boolean;
  /** Every seat the athlete holds on this coach's staff, with each one's hold. */
  seats: Array<{ heldAt: Date | string | null }>;
  /** The two already have at least one message between them. */
  hasHistory: boolean;
}

/** The one decision. Parked is asked per seat: an athlete with one live seat on the staff is coached. */
export function relationshipStateFrom(facts: RelationshipFacts): RelationshipState {
  if (facts.rolesAreCoachAndAthlete && facts.inScope && facts.seats.length > 0) {
    return facts.seats.some((s) => s.heldAt == null) ? "active" : "held";
  }
  return facts.hasHistory ? "ended" : "none";
}

/** May either party read the thread? Everything but "none". */
export function threadIsReadable(state: RelationshipState): boolean {
  return state !== "none";
}

declare const SEND_PERMIT: unique symbol;
/** The only thing `insertCoachMessage` accepts. Minted here and nowhere else: a value of this
 *  type exists only for an ACTIVE relationship and for a sender who is one of its two people. */
export type SendPermit = {
  readonly [SEND_PERMIT]: true;
  readonly coachId: number;
  readonly athleteId: number;
  readonly senderId: number;
  readonly recipientId: number;
};

export function sendPermitFor(rel: CoachingRelationship, senderId: number): SendPermit | null {
  if (rel.state !== "active") return null;
  if (rel.coachId === rel.athleteId) return null;
  if (senderId !== rel.coachId && senderId !== rel.athleteId) return null;
  const recipientId = senderId === rel.coachId ? rel.athleteId : rel.coachId;
  return { coachId: rel.coachId, athleteId: rel.athleteId, senderId, recipientId } as SendPermit;
}

/** The sentence a refused send carries. Never "not found" for a thread sitting on the screen. */
export function sendRefusal(state: RelationshipState): string {
  const sentences: Record<RelationshipState, string> = {
    active: "",
    held: "This athlete is on hold for the off season, so new messages wait until the hold is lifted. Earlier messages stay here.",
    ended: "This coaching relationship has ended, so this conversation is read-only.",
    none: "Messages are only between a coach and an athlete they coach.",
  };
  return sentences[state];
}

/** A message as one reader sees it. A removed message's body is hidden from the OTHER party only:
 *  its sender still sees what they sent, and a minor's guardian and an admin audit see it all. */
export type MessageViewer = "sender" | "other_party" | "guardian" | "admin";

export function bodyVisibleTo(viewer: MessageViewer, removed: boolean): boolean {
  return !removed || viewer !== "other_party";
}

/** Does a parent read this thread? An athlete under 18 (or with no date of birth, which is read
 *  as not known to be an adult, the same reading the guardian coach-comments route makes) who has
 *  a linked guardian. Both parties are told so on the thread. */
export function parentCanSeeThread(input: { hasGuardian: boolean; isAdult: boolean }): boolean {
  return input.hasGuardian && !input.isAdult;
}

/** Any run of whitespace, newlines included: matches "  \n\t" in "a  \n\tb", not the "a" or "b".
 *  Tester: https://regex101.com/?regex=%5Cs%2B&testString=a%20%20%0A%09b&flags=g */
const WHITESPACE_RUN = /\s+/g;

export function notificationPreview(body: string): string {
  const clean = body.replace(WHITESPACE_RUN, " ").trim();
  return clean.length > NOTIFICATION_PREVIEW_LENGTH ? `${clean.slice(0, NOTIFICATION_PREVIEW_LENGTH - 1)}…` : clean;
}
