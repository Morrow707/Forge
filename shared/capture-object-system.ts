// WHAT THE OBJECT SYSTEM WAS ON THIS TAKE, STATED BY THE TRACKER THAT FILMED IT.
//
// RULE #4 in CLAUDE.md: "Every capture mode names the object it expects, and if the scene
// genuinely has no implement (jump, sprint, mechanics, horizontal_load) it names what it DOES
// have -- a box, a ground plane -- or records explicitly that it has none, so overwatch's
// silence is a recorded fact and not an absence."
//
// Four trackers have been failing that half for as long as they have existed. av-jump,
// av-sprint, av-mechanics and av-horizontal-load pass no `trackingMode`, so
// `AvCoreMlImplementDetector.targetLabel` returns nil, the detector is inert and
// `coreMlDetectionEnabled` is false. Nothing in any export says whether that is a decision or a
// bug, and the two look identical: an absent key. The 2026-10-04 box jump is the cost -- Scott
// jumped onto a box, the system that is meant to find the box was not asked for, and the
// diagnostics read as though an object system had simply found nothing.
//
// So every tracker declares. A declaration is not a capability: `declared: "none"` is a correct,
// shippable answer and most of the implement-less modes give it. What it is not allowed to be is
// SILENT -- a reader of an export can now tell "this mode has no object to find, and here is
// why" from "this mode should have had one and it never ran".
//
// This records and gates nothing (Rule #1). No branch anywhere reads it.

export type CaptureObjectSystem = {
  /** What kind of object system ran. "coreml" = the trained detector; "box" = the rectangle
   *  detector that finds a plyo box top (`detectBox`, not a CoreML class); "none" = the scene
   *  has no object this pipeline can find, stated on purpose. */
  declared: "coreml" | "box" | "none";
  /** The CoreML class actually asked for on THIS take, or null. Per-exercise on the bar tracker
   *  (a loaded bar asks for "plate", a dumbbell complex for "dumbbell"), fixed everywhere else. */
  coreMlClass: string | null;
  /** The second class on the same clip, where one exists -- only the barbell family has one. */
  secondaryCoreMlClass: string | null;
  /** Whether the plyo-box rectangle detector ran. Independent of CoreML: the box jump has this
   *  and no CoreML class, which is exactly the case the old absent-key shape could not express. */
  boxDetector: boolean;
  /** Why, in a sentence, for whoever reads the export. */
  reason: string;
};

export type TrackerKey =
  | "av_bar" | "av_jump" | "av_kb_swing" | "av_medball" | "av_swing"
  | "av_sprint" | "av_mechanics" | "av_horizontal_load"
  | "bar" | "kb_swing" | "medball" | "swing"
  | "sprint" | "mechanics" | "horizontal_load";

const NO_OBJECT_IN_THE_SCENE =
  "No object this detector knows is in the scene -- the measurement is of the athlete's body "
  + "alone. Overwatch runs and has one witness, which is a known ceiling, not a gap.";

export const OBJECT_SYSTEM_BY_TRACKER: Record<TrackerKey, CaptureObjectSystem> = {
  av_bar: {
    declared: "coreml", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false,
    reason: "The implement is resolved per exercise from the equipment prop; a loaded bar also "
      + "asks for the plate, which is the one object of known real-world diameter.",
  },
  av_jump: {
    // THE 2026-10-04 BOX JUMP. objectLock came back null and overwatch had nothing to arbitrate,
    // and no field said whether the box detector had run. It had -- `detectBox` -- and that is
    // what this declaration makes readable.
    declared: "box", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: true,
    reason: "The box is found by the rectangle detector, not by CoreML -- there is no box class "
      + "in the model. A flat jump has no object at all and declares boxDetector false.",
  },
  av_kb_swing: {
    declared: "coreml", coreMlClass: "kettlebell", secondaryCoreMlClass: null, boxDetector: false,
    reason: "One object with one answer, so no secondary class is worth the frame time.",
  },
  av_medball: {
    declared: "coreml", coreMlClass: "med_ball", secondaryCoreMlClass: null, boxDetector: false,
    reason: "The ball is the implement and the thrown object both.",
  },
  av_swing: {
    declared: "coreml", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false,
    reason: "Golf or bat, resolved per drill: the ball is the object of known size, the club or "
      + "bat is what moves.",
  },
  av_sprint: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: NO_OBJECT_IN_THE_SCENE },
  av_mechanics: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: NO_OBJECT_IN_THE_SCENE },
  av_horizontal_load: {
    declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false,
    reason: "A sled or a carry: the load is behind or beside the athlete and is not a class this "
      + "model knows. " + NO_OBJECT_IN_THE_SCENE,
  },
  // The web/MediaPipe halves run no native detector at all, which is a fact about the PLATFORM
  // rather than about the movement -- stated separately so a reader does not read "none" on a
  // web bar take as "a barbell take has no object".
  bar: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: "Web capture path: the CoreML detector is native-only." },
  kb_swing: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: "Web capture path: the CoreML detector is native-only." },
  medball: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: "Web capture path: the CoreML detector is native-only." },
  swing: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: "Web capture path: the CoreML detector is native-only." },
  sprint: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: NO_OBJECT_IN_THE_SCENE },
  mechanics: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: NO_OBJECT_IN_THE_SCENE },
  horizontal_load: { declared: "none", coreMlClass: null, secondaryCoreMlClass: null, boxDetector: false, reason: NO_OBJECT_IN_THE_SCENE },
};

/** The declaration for this take. `actual` carries what the tracker really sent, where that is
 *  decided per exercise rather than per tracker -- the registry holds the intent, the take holds
 *  the class. A fresh object every call, like cameraTunablesFor: a caller that scribbles on its
 *  own declaration must not move another capture's. */
export function declareObjectSystem(
  tracker: TrackerKey,
  actual?: { coreMlClass?: string | null; secondaryCoreMlClass?: string | null; boxDetector?: boolean },
): CaptureObjectSystem {
  const base = OBJECT_SYSTEM_BY_TRACKER[tracker];
  if (!base) throw new Error(`no object system declared for tracker ${tracker}`);
  return {
    declared: base.declared,
    coreMlClass: actual?.coreMlClass ?? base.coreMlClass,
    secondaryCoreMlClass: actual?.secondaryCoreMlClass ?? base.secondaryCoreMlClass,
    boxDetector: actual?.boxDetector ?? base.boxDetector,
    reason: base.reason,
  };
}
