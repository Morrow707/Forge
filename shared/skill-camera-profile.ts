// What the camera needs to know about each skill drill.
//
// The strength side got this treatment first (client/src/lib/exercise-camera-profile.ts, built
// from the execution manual). The skill side had nothing equivalent: every one of the 296 seeded
// drills was handled by two pieces of guesswork.
//
// The first was mechanicsModeFor, duplicated verbatim in skill-workout.tsx and
// skill-day-view-dialog.tsx, which read "Throwing, Pitching and Shooting are a throw, everything
// else is a swing." That sent a quarterback's throwing mechanics, a tennis serve, a volleyball
// serve and a javelin release through swing analysis -- four overhead throwing patterns measured
// as rotational swings. It also could not express "Jumps & Throws", a single skillType holding
// both a long jump and a shot put.
//
// The second was the camera-angle picker, which asks the athlete to choose "face-on" or "down
// the line" without saying where either is. "Down the line" has no meaning without a reference
// line, and the line is a different thing in every sport: the target line in golf, the pitcher-
// catcher line in hitting, the service box in tennis, the throwing direction in shot put, the
// lane in a sprint. An athlete guessing wrong does not get a worse number, they get a number
// measuring the axis the code is blind to.

export type SkillMechanicsMode = "swing" | "throw";
export type SkillCameraAngle = "face_on" | "down_the_line";

export type SkillMechanicsProfile = {
  mode: SkillMechanicsMode;
  /** The angle that sees this drill's primary fault. The picker still lets the athlete choose --
   * they may only have one place to stand -- but this is what it should recommend. */
  preferredAngle: SkillCameraAngle;
  /** Where to stand for each angle, in this sport's own terms. */
  faceOn: string;
  downTheLine: string;
  inFrame: string;
  oneRep: string;
};

// Overhead throwing patterns: one arm cocks, the trunk rotates, the arm extends and releases.
// Hip-shoulder separation and arm slot are the whole point, and both are edge-on from down the
// line, which is why every profile here prefers it.
const THROW_DEFAULTS = {
  mode: "throw" as const,
  preferredAngle: "down_the_line" as const,
};

// Rotational swing patterns: two hands (or an implement) travel through an arc in front of the
// body. Weight transfer is the fault that costs most, and it is only visible face-on.
const SWING_DEFAULTS = {
  mode: "swing" as const,
  preferredAngle: "face_on" as const,
};

const BY_SKILL_TYPE: Record<string, SkillMechanicsProfile> = {
  Hitting: {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the athlete's chest, level with the hips, from where a pitcher would stand. Sees the stride, the weight moving from back foot to front, and the hips opening.",
    downTheLine:
      "Behind the athlete along the line from the plate to the pitcher, level with the hips. Sees the hands staying inside the ball and the shoulders lagging the hips.",
    inFrame: "Both feet, both hands, the bat head at its furthest point back, and the head.",
    oneRep: "One rep = load, stride, swing, finish. The rep ends at the finish, not at contact.",
  },
  Pitching: {
    ...THROW_DEFAULTS,
    faceOn:
      "Square to the athlete's chest from the side the glove faces, level with the hips. Sees the stride length and the front side opening early.",
    downTheLine:
      "Behind the mound along the line to the plate, level with the hips. Sees arm slot, hip-shoulder separation and the trunk sequencing.",
    inFrame: "The back foot on the rubber, the front foot at landing, the throwing hand at its highest, and the head.",
    oneRep: "One rep = set, leg lift, stride, throw, follow-through. The rep ends when the throwing arm finishes across the body.",
  },
  Throwing: {
    ...THROW_DEFAULTS,
    faceOn: "Square to the athlete's chest, level with the hips. Sees the stride direction and the front side.",
    downTheLine: "Behind the athlete along the throwing direction, level with the hips. Sees arm slot and separation.",
    inFrame: "Both feet, the throwing hand at its highest point, and the head.",
    oneRep: "One rep = crow hop or stride, throw, follow-through.",
  },
  Fielding: {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the athlete from where the ball is coming, level with the knees. Sees the glove getting out front and the feet working through the ball.",
    downTheLine: "From the side, level with the knees. Sees how low the hips get and whether the back rounds instead.",
    inFrame: "Both feet, the glove at its lowest point, and the hips.",
    oneRep: "One rep = approach, field the ball, transfer, set to throw.",
  },
  Catching: {
    ...SWING_DEFAULTS,
    faceOn: "Square to the athlete's chest, level with the chest. Sees the hands presenting and the body squaring to the ball.",
    downTheLine: "From the side, level with the chest. Sees whether the hands give with the catch or stab at it.",
    inFrame: "Both hands, the head, and the feet.",
    oneRep: "One rep = set, receive, secure.",
  },
  Shooting: {
    ...THROW_DEFAULTS,
    faceOn:
      "Square to the athlete's chest from in front of the target, level with the chest. Sees whether the shoulders stay square and the feet land where they started.",
    downTheLine:
      "From the side, along the line from the athlete to the target, level with the chest. Sees the elbow under the ball, the release point and the follow-through.",
    inFrame: "Both feet, the shooting hand at the release, and the head.",
    oneRep: "One rep = gather, rise, release, land. The rep ends on landing, not at the release.",
  },
  "Full Swing": {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the athlete's chest, level with the hands at address, on the side the ball flies away from. Sees weight transfer, hip slide and early extension.",
    downTheLine:
      "Behind the athlete along the target line, camera level with the hands at address, standing on an extension of the ball-to-target line. Sees swing plane, shaft angle and the club path through impact.",
    inFrame: "Both feet, the club head at the top of the backswing, the ball, and the head.",
    oneRep: "One rep = address, backswing, downswing, impact, finish. The rep ends at a held finish.",
  },
  Groundstrokes: {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the athlete from the other side of the net, level with the hips. Sees the unit turn, the weight moving forward and the balance at contact.",
    downTheLine:
      "From the side, along the baseline, level with the hips. Sees the take-back length, the low-to-high path and the contact point relative to the front foot.",
    inFrame: "Both feet, the racket head at its furthest point back, the contact point, and the head.",
    oneRep: "One rep = split step, turn, swing, recover. The rep ends at the recovery step, not at contact.",
  },
  Serve: {
    ...THROW_DEFAULTS,
    faceOn:
      "From the other side of the net, square to the athlete, level with the hips. Sees the toss placement relative to the body and the shoulders opening early.",
    downTheLine:
      "Behind the athlete along the line into the service box, level with the hips. Sees the trophy position, the racket drop behind the back, arm slot and the shoulder-over-shoulder finish.",
    inFrame: "Both feet, the toss at its peak, the racket at its lowest point behind the back, and the contact point.",
    oneRep: "One rep = toss, trophy, drop, contact, landing. The rep ends on landing inside the court.",
  },
  Serving: {
    ...THROW_DEFAULTS,
    faceOn:
      "From the other side of the net, square to the athlete, level with the hips. Sees the toss placement and whether the hitting shoulder stays behind the ball.",
    downTheLine:
      "Behind the athlete along the line into the court, level with the hips. Sees the arm slot, the hip-shoulder separation and the contact point relative to the head.",
    inFrame: "Both feet, the toss at its peak, the hitting hand at contact, and the head.",
    oneRep: "One rep = toss, approach or step, contact, landing.",
  },
  "QB Mechanics": {
    ...THROW_DEFAULTS,
    faceOn:
      "Square to the quarterback's chest from the side the throwing arm is NOT on, level with the hips. Sees the front shoulder flying open and the base widening or narrowing on the throw.",
    downTheLine:
      "Behind the quarterback along the intended throwing line, level with the hips. Sees the arm slot, the hip-shoulder separation through the throw and whether the feet finish pointed at the target.",
    inFrame: "Both feet through the whole drop, the throwing hand at its highest point, and the head.",
    oneRep: "One rep = snap or start, drop, plant, throw, follow-through. The rep ends when the throwing arm finishes.",
  },
  Kicking: {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the kicker from the side the ball travels toward, level with the hips. Sees the plant foot placement relative to the ball and the hips squaring up.",
    downTheLine:
      "Behind the kicker along the intended ball flight, level with the hips. Sees the approach angle, the swing plane of the kicking leg and the follow-through direction.",
    inFrame: "Both feet, the ball, the kicking foot at its highest point in the follow-through, and the hips.",
    oneRep: "One rep = approach, plant, strike, follow-through.",
  },
  "Sprint Mechanics": {
    mode: "swing",
    preferredAngle: "down_the_line",
    faceOn:
      "Square to the athlete from the front or behind, level with the hips. Sees arm crossover, hip drop and whether the feet cross the midline.",
    downTheLine:
      "From the side of the lane, level with the hips, far enough back that several strides fit in frame. Sees knee height, shin angle, ground contact and heel recovery.",
    inFrame: "Both feet through at least three full strides, the hips, and the head.",
    oneRep: "One rep = one full stride cycle, left foot strike to the next left foot strike.",
  },
  "Jumps & Throws": {
    ...SWING_DEFAULTS,
    faceOn: "Square to the athlete, level with the hips. Sees the takeoff or release direction and lateral lean.",
    downTheLine: "Along the runway or the throwing direction, level with the hips. Sees the approach rhythm and the takeoff or release angle.",
    inFrame: "The last three strides of the approach, both feet at takeoff, and the implement at release.",
    oneRep: "One rep = approach, plant, takeoff or release, landing.",
  },
  Takedowns: {
    ...SWING_DEFAULTS,
    faceOn:
      "Square to the athlete from the front, level with the hips. Sees the level change depth and whether the head stays up.",
    downTheLine: "From the side, level with the hips. Sees the penetration step depth, the back angle and the hip drive.",
    inFrame: "Both athletes' feet, both hips, and the head of the athlete being scored.",
    oneRep: "One rep = stance, setup, level change, penetration step, finish.",
  },
};

// Drills whose own skillType gives the wrong answer.
//
// "Jumps & Throws" is one skillType covering two unrelated actions. A long jump is a rotational
// whole-body takeoff and a shot put is an overhead-ish throw, and no single default is right for
// both. Rather than split the taxonomy -- which is coach-facing and not ours to churn -- the
// three genuine throwing events are named here.
const BY_DRILL_NAME: Record<string, Partial<SkillMechanicsProfile>> = {
  "Shot Put Glide Technique": {
    ...THROW_DEFAULTS,
    downTheLine: "Behind the athlete along the throwing direction, level with the hips. Sees the block on the front side and the release angle.",
    oneRep: "One rep = glide or spin, plant, release. The rep ends at the release, before the reverse.",
  },
  "Discus Spin Technique": {
    ...THROW_DEFAULTS,
    downTheLine: "Outside the circle along the throwing direction, level with the hips. Sees the orbit of the throwing arm and whether the hips lead the shoulders out of the back.",
    oneRep: "One rep = wind, spin, plant, release.",
  },
  "Javelin Approach and Release": {
    ...THROW_DEFAULTS,
    downTheLine: "Behind the runway along the throwing direction, level with the hips. Sees the arm staying back through the crossovers and the release angle.",
    oneRep: "One rep = approach, crossovers, plant, release.",
  },
};

const DEFAULT_PROFILE: SkillMechanicsProfile = {
  ...SWING_DEFAULTS,
  faceOn: "Square to the athlete's chest, level with the hips.",
  downTheLine: "From the side, level with the hips, along the direction the action travels.",
  inFrame: "Both feet, both hands, and the head, for the whole action.",
  oneRep: "One rep = the whole action from set-up to a held finish.",
};

/** The camera profile for a drill. Falls back to its skillType, then to a generic swing.
 *
 * A coach can type a skillType that is not on the quick-pick list (see the column's own comment
 * in shared/schema.ts), so an unrecognised type has to resolve to something rather than throw. */
export function skillCameraProfile(
  skillType: string | null | undefined,
  drillName?: string | null,
): SkillMechanicsProfile {
  const base = (skillType && BY_SKILL_TYPE[skillType]) || DEFAULT_PROFILE;
  const override = drillName ? BY_DRILL_NAME[drillName] : undefined;
  return override ? { ...base, ...override } : base;
}

/** Which analysis a drill routes to. Replaces the two duplicated copies of mechanicsModeFor. */
export function mechanicsModeFor(
  skillType: string | null | undefined,
  drillName?: string | null,
): SkillMechanicsMode {
  return skillCameraProfile(skillType, drillName).mode;
}

/** The noun the tracker uses for one attempt ("Record Throw", "Swing 3 of 5"). */
export function mechanicsActionLabelFor(
  skillType: string | null | undefined,
  drillName?: string | null,
): string {
  if (skillType === "Shooting") return "Shot";
  if (skillType === "Serve" || skillType === "Serving") return "Serve";
  if (skillType === "Kicking") return "Kick";
  if (skillType === "Takedowns") return "Attempt";
  if (skillType === "Full Swing" || skillType === "Groundstrokes") return "Swing";
  return mechanicsModeFor(skillType, drillName) === "throw" ? "Throw" : "Swing";
}

// How far the athlete actually runs, for the sprint-timing drills.
//
// The sprint tracker opens on the "40-yard dash" preset for every drill. Distance is what turns
// two timing taps into a speed, so an athlete filming a 20-yard dash who does not change it gets
// every speed number back at double. A drill whose NAME states its distance should never have
// been asking, and a 5-10-5 shuttle is worse than merely unset -- read as a distance its name
// suggests 5 yards, while the athlete actually covers 20 over three legs.
//
// presetId matches SPRINT_PRESETS in client/src/lib/sprint-tracking.ts. Where no preset fits,
// distanceYards carries the answer for the 2-tap custom case instead.
export type SprintDefaults = { presetId?: string; distanceYards?: number };

const SPRINT_DEFAULTS: Record<string, SprintDefaults> = {
  "20-Yard Dash": { presetId: "20yd", distanceYards: 20 },
  "40-Yard Dash": { presetId: "40yd", distanceYards: 40 },
  "60-Yard Dash": { distanceYards: 60 },
  "5-10-5 Pro Agility Footwork": { presetId: "5-10-5" },
  // Five yards out, ten back, five through: the same three legs as the pro agility, under the
  // name the football combine uses.
  "Pro Agility Shuttle": { presetId: "5-10-5" },
  "T-Drill Change of Direction": { distanceYards: 40 },
  "Home to First Sprint Drill": { distanceYards: 30 },
  "Base Running - Turn at First": { distanceYards: 30 },
  "First Three Steps Drill": { presetId: "10yd", distanceYards: 10 },
  "Block Start Setup": { presetId: "10yd", distanceYards: 10 },
  "Falling Start Drill": { presetId: "10yd", distanceYards: 10 },
  "Reactive Start Drill": { presetId: "10yd", distanceYards: 10 },
  "Standing Start Acceleration": { presetId: "20yd", distanceYards: 20 },
  "Reaction Time Starts": { presetId: "10yd", distanceYards: 10 },
};

/** What the sprint tracker should open on for a named drill, or null when the distance genuinely
 * varies and the athlete has to enter it. */
export function sprintDefaultsFor(drillName: string | null | undefined): SprintDefaults | null {
  if (!drillName) return null;
  return SPRINT_DEFAULTS[drillName] ?? null;
}
