/* THE OFF-SEASON HOLD: ONE PARKED SEAT, FOUR SEPARATE QUESTIONS.
 *
 * Added 2026-10-29. Scott: "what happens in the off season? They players will come back in a few
 * months, we need to build a database where the coach can put the player on hold, they don't get
 * charged for it, and all of the players data remains for the coach when they come back."
 *
 * The hold itself is three columns on `coach_athletes` (see that table's comment in
 * shared/schema.ts for why it is a state of the relationship rather than a table of its own).
 * This module is the DECISION, and it is separate from the columns for the reason this repo keeps
 * relearning: a fact with two readers that each test it inline is a fact that diverges silently.
 * `coach_athletes` is joined at twenty-one query sites in server/storage.ts across eighty-seven
 * references, and **a hold flag that only half of them read is worse than no hold at all** -- it
 * would bill a parked seat on some paths and not others, with nothing on any screen to show the
 * difference. `server/every-roster-read-is-hold-aware.test.ts` is the ratchet that holds that
 * line; this is the module it points every site at.
 *
 * ================================ THE FOUR QUESTIONS ================================
 *
 * "On hold" is not one question. It is four, they do not follow from one another, and NOTHING MAY
 * INFER ONE FROM ANOTHER:
 *
 *   1. Is the seat billed?                        NO   seatIsBilled()
 *   2. May the coach read their history?          YES  coachMayReadSeat()
 *   3. May the coach assign new work?             NO   coachMayAssignToSeat()
 *   4. Do they count as coached for their OWN     NO   seatCountsAsCoached()
 *      entitlements (camera, skills, AI)?
 *   5. Do they appear in the program's CURRENT    NO   seatIsInSeason()
 *      operational views and caps?
 *
 * SAID PLAINLY SO THIS DOES NOT READ AS CEREMONY: four of the five are the same negation today.
 * They are five names anyway, for three reasons that are not style. Question 2 is genuinely the
 * other answer, and it is the one the whole feature exists for. Question 4 has a documented
 * EXCEPTION (below), so it is not a negation even now. And the remaining three are independently
 * revisable -- writing them as one `isHeld()` boolean is exactly how somebody later changes one of
 * them and silently moves the other two, which is the defect this repo has recorded eight times
 * under "a correction wired to one of two paths". The decision made about the camera registry
 * applies unchanged: separate the DECLARATIONS, share the MECHANISM, so a change to one question
 * shows up in a grep as a change to one question.
 *
 * AND THE BLAST RADIUS IS MUCH SMALLER THAN TWENTY-ONE SITES, which is the thing the
 * classification measured rather than assumed. Most roster-wide coach reads INNER JOIN the
 * activity they report on -- `getRosterWellnessToday` and `getRosterFlaggedTrend` join
 * `wellnessCheckins`, `getRosterAcwrSummary` and `getRosterLoadTrend` join `workout_logs` -- so a
 * parked athlete generates no rows and contributes nothing whether the query filters holds or not.
 * Those need NO change, and changing them would be worse than neutral: a held athlete who did
 * train or did check in produced real data, and their coach should see it. The sites that genuinely
 * need question 5 are the ones using the roster as a DENOMINATOR or as a CAP, where an absent
 * athlete is counted as a failure rather than as absent: the weekly digest's missed-workout count
 * (sixty parked athletes become sixty missed workouts) and the CARA compliance report and cap.
 *
 * Question 2 is why the whole thing works, and it is a one-line answer because of the 2026-10-24
 * security audit: every coach read in the app funnels through `athleteIsInCoachScope` /
 * `athleteIdsInCoachScope`, so "the coach keeps every read of a held athlete" is a property of two
 * helpers rather than of forty routes. Analytics, leaderboards, exercise history, recent PRs, the
 * calendar and the training-history export all keep working with no edit of their own.
 *
 * Question 4 is the one with a sharp edge, and it has a DOCUMENTED EXCEPTION rather than a flipped
 * boolean. Scott, 2026-10-29, on whether a held athlete reverts to a Free Agent: in the off season
 * they are training on their own, so the camera, the skills side and the AI follow their own tier
 * -- which is also the honest answer, since nothing is being coached in July. But a class their
 * COACH enrolled them in is content the program already bought and already gave, and taking
 * chapter five back because the season ended is a withheld thing with no replacement, which is
 * what Rule #1 in CLAUDE.md exists to refuse. `classEnrollments.coachId` already carries the
 * provenance (it equals the athleteId for a self-enrolment), so `classGateStateFor` answers that
 * case directly and `heldSeatKeepsCoachGivenContent` is the name of the rule.
 *
 * ============================ WHAT A HOLD DOES NOT CHANGE ============================
 *
 * **Retention is coach-blind, and a hold must never pretend otherwise.** `resolveVideoRetentionLimits`
 * in shared/video-retention.ts reads `hasVideoStorageAddOn`, `isBetaAccount`, `trialExpiresAt`,
 * `isMinor` and the enforcement switch -- and nothing at all about having a coach; its own header
 * says the caps apply "to BOTH Free Agents and coached athletes alike". The minor tier purge (30
 * days under 13, 90 days 13-17) is DOB-gated and ungated by any billing flag on purpose. So a
 * fifteen-year-old's form videos are already gone at ninety days whether they are held or not, and
 * **no hold may exempt an athlete from any retention sweep**: a four-month hold is inside the
 * twelve-month stale-account window and so does nothing, and a hold that reaches twelve months is
 * a hold nobody lifted, where the warning is correct. Exempting held athletes would keep a
 * forgotten minor's footage forever, which is the inverse of the promise.
 *
 * "All of the player's data remains" therefore means THE NUMBERS, and it is already true: purging
 * a video never touches velocity, range of motion, bar path, trust scores or the skeleton trace.
 * What a hold adds is that the coach can still READ them.
 *
 * ============================== AND NOTHING IS "ACTIVATED" ==============================
 *
 * There is no profile to expire and none to activate. "Free Agent" is not a role -- `roleEnum` is
 * ["coach","athlete","admin","guardian"] -- it is `role === "athlete"` with no active coach seat,
 * recomputed per request by `storage.getCoachesForAthlete`, which both the server
 * (`athleteHasCoach`) and the client (`useIsFreeAgent`, via `/api/athlete/coaches`) resolve
 * through. So holding and unholding flip every derived answer in both directions with zero
 * bookkeeping: no state machine, no activation job, no nightly reconciler. Bringing an athlete
 * back is one UPDATE setting `held_at` to null.
 */

/** The parts of a `coach_athletes` row this module decides from. Accepts the whole row; takes a
 *  structural type so a narrowed `select()` satisfies it without a cast, and so the pure tests
 *  need no database. `heldUntil` is a `date` column, which drizzle hands back as a string. */
export interface RosterSeatHoldState {
  heldAt: Date | string | null;
  heldUntil?: string | null;
  heldByCoachId?: number | null;
}

/** Is this seat parked? The one structural fact; the four questions below are the decisions, and
 *  call sites read a decision rather than this. */
export function seatIsHeld(seat: RosterSeatHoldState): boolean {
  return seat.heldAt != null;
}

/** QUESTION 1 -- IS THE SEAT BILLED? No.
 *
 *  This is the ask, and it is the only one of the four that moves money. `getRosterSeatCountForCoach`
 *  counts billed seats, `getBilledAthleteCountForCoach` is max(that, plannedAthleteCount), and the
 *  band is derived from it.
 *
 *  WORTH KNOWING BEFORE SOMEBODY REPORTS IT AS A BUG: a hold does not always lower the bill,
 *  because the billed count is the LARGER of the seats held and the headcount the school typed at
 *  signup. A program that said "about 180" and holds 120 in June still bills the 180 band -- they
 *  are a 180-athlete program and they will be back in August, which is what they signed up for.
 *  The hold's money effect is real for programs whose roster has outgrown their estimate, which is
 *  exactly the population server/coach-band-drift-job.ts exists to measure. The plan screen shows
 *  the held count beside the roster count so a school that wants the quote to fall can lower its
 *  own number. */
export function seatIsBilled(seat: RosterSeatHoldState): boolean {
  return !seatIsHeld(seat);
}

/** QUESTION 2 -- MAY THE COACH READ THEIR HISTORY? Yes. This is the whole point of a hold.
 *
 *  Takes the seat and ignores it on purpose. The parameter is not decoration: it makes every call
 *  site a place where this decision was MADE, so the day somebody wants a hold to also hide an
 *  athlete, there is one function to change and a grep that finds every reader. A bare `true`
 *  inlined at the call sites would make that change invisible.
 *
 *  A held athlete is still in `athleteIsInCoachScope`, which since 2026-10-24 is what every coach
 *  read in the app resolves through. That is the difference between a hold and today's removal:
 *  removing deletes the seat, and the audit's rule is that "the roster is the relationship", so a
 *  removed athlete's analytics, exercise history, leaderboard rows, recent PRs and calendar all go
 *  dark to the coach even though every row survives. */
export function coachMayReadSeat(_seat: RosterSeatHoldState): boolean {
  return true;
}

/** QUESTION 3 -- MAY THE COACH ASSIGN NEW WORK? No. Reads widen, writes narrow.
 *
 *  Nothing new lands on a held athlete's calendar: no program assignment, no skill program, no
 *  team add. The refusal names the hold and its return date rather than 404ing, because a coach who
 *  parked somebody in June has forgotten by August and "not found" is the wrong sentence for a seat
 *  that is sitting right there on their roster screen under "On hold".
 *
 *  This is also what keeps the athlete's own calendar honest. `getCalendarForAthlete` filters on
 *  `assignments.athleteId` with no coach filter, so a held athlete keeps every day their coach
 *  already assigned -- which is correct (that is their training history and their in-flight
 *  program) and is exactly why no NEW day may be added on top of it by a program they are not
 *  currently being coached on. */
export function coachMayAssignToSeat(seat: RosterSeatHoldState): boolean {
  return !seatIsHeld(seat);
}

/** QUESTION 4 -- DO THEY COUNT AS COACHED FOR THEIR OWN ENTITLEMENTS? No.
 *
 *  Scott, 2026-10-29: a held athlete reverts to a Free Agent, and in the off season that is simply
 *  true -- they are training on their own, so the camera, the skills side and the AI follow their
 *  own tier the way any uncoached athlete's do. `cameraAccessFor` answers `tier_excludes_camera`,
 *  `skillsAccessFor` answers `tier_excludes_skills`, `FreeAgentGate` opens their own program
 *  builder, and they can buy a tier for the summer.
 *
 *  THE EXCEPTION IS NOT OPTIONAL: see heldSeatKeepsCoachGivenContent below. A class the coach gave
 *  them is not theirs to lose. */
export function seatCountsAsCoached(seat: RosterSeatHoldState): boolean {
  return !seatIsHeld(seat);
}

/** THE EXCEPTION TO QUESTION 4, AND THE REASON IT IS A NAMED RULE RATHER THAN AN `IF`.
 *
 *  A held athlete is uncoached for anything they would BUY and coached for anything the program
 *  already BOUGHT AND GAVE THEM. Today that is the Forge class catalog, where
 *  `classEnrollments.coachId` records which it was; the rule is written as a name so the next piece
 *  of given content (a skill program, an unlocked sport) is asked the same question instead of
 *  inheriting whichever of the two branches somebody reached for first.
 *
 *  Without it, a hold locks every chapter past chapter one of a class the coach assigned and draws
 *  a $19.99 buy card in front of a fifteen-year-old for content their program paid for. */
export const heldSeatKeepsCoachGivenContent = true as const;

/** QUESTION 5 -- DO THEY APPEAR IN THE PROGRAM'S CURRENT OPERATIONAL VIEWS AND CAPS? No.
 *
 *  "In season" is the right axis for a hold built for an off season, and it is a different
 *  question from question 2: the coach may read everything a held athlete ever did (their history
 *  is the ask), and a held athlete is not part of what the program is DOING right now. A parked
 *  athlete generates no activity by construction, so a view that counts the roster and reports
 *  absences turns a hold into sixty problems -- the weekly digest would report sixty missed
 *  workouts and the compliance report sixty athletes at zero minutes, none of which is true of
 *  anybody.
 *
 *  ONLY DENOMINATORS AND CAPS, and this is the part to get right rather than spraying the
 *  predicate over every roster query. A view that INNER JOINs the activity it reports on is
 *  already correct: a held athlete with no check-ins and no sessions contributes no rows, and one
 *  who did check in or did train produced real data that their coach should see. So this is read
 *  by `getCoachWeeklyDigest`'s missed-workout roster, `getCaraComplianceForCoach`,
 *  `getCaraSessionsForCoach` and `getCaraCapMinutesForAthlete` -- the last of those also being
 *  question 4 in another costume, since a coach's weekly training cap has no business governing an
 *  athlete's own summer once the program has parked them. */
export function seatIsInSeason(seat: RosterSeatHoldState): boolean {
  return !seatIsHeld(seat);
}

/** Every seat that counts toward the bill. */
export function billedSeats<T extends RosterSeatHoldState>(seats: readonly T[]): T[] {
  return seats.filter(seatIsBilled);
}

/** Every parked seat -- what the roster screen's "On hold" section lists. */
export function heldSeats<T extends RosterSeatHoldState>(seats: readonly T[]): T[] {
  return seats.filter(seatIsHeld);
}

/** Is this parked seat at or past the return date the coach stated?
 *
 *  DRIVES A PROMPT, NEVER AN ACTION, and that is a decision rather than an unfinished feature.
 *  Bringing a seat back starts billing it, and this repo's rule is that money does not move
 *  unattended -- coach-band-drift-job.ts ships the measurement and leaves COACH_BAND_DRIFT_REBILL
 *  unset for exactly this reason, and the camera pipeline lands every new diagnostic with
 *  `appliedCorrection: false`. It is also the better product: seasonal rosters move in bulk, so a
 *  coach who parked sixty in June brings back fifty-five in August because five graduated, and one
 *  confirmable prompt they can uncheck beats fifty-five silent auto-lifts they then have to audit.
 *  A graduating senior's hold must expire into nothing, not into a billed seat.
 *
 *  `today` is passed in, never read from the clock here: this module is pure so the tests need no
 *  database and no fake timers, and workflow scripts in this repo cannot call Date.now() at all. */
export function seatIsDueBack(seat: RosterSeatHoldState, today: string): boolean {
  if (!seatIsHeld(seat)) return false;
  if (!seat.heldUntil) return false;
  return seat.heldUntil <= today;
}

/** The sentence a write refusal carries. Names the hold and the way out of it, because "not found"
 *  is the wrong answer for a seat sitting on the coach's own roster under "On hold". */
export function heldSeatRefusalMessage(athleteName: string, heldUntil?: string | null): string {
  const until = heldUntil ? ` until ${heldUntil}` : "";
  return `${athleteName} is on hold${until}. Bring them back to your active roster to assign them anything.`;
}
