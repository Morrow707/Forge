import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bodyYardstickPx,
  handAnchor,
  lockDistanceVerdict,
  referenceObjectVerdict,
  arbitrate,
  bodyReadIsStable,
  MAX_YARDSTICK_DEVIATION_RATIO,
  MIN_YARDSTICK_SAMPLES_FOR_STABILITY,
  MAX_LOCK_DISTANCE_IN_YARDSTICKS,
  FALLBACK_LOCK_DISTANCE_FRAME_FRACTION,
  MIN_YARDSTICK_PX,
  MAX_PLATE_ASPECT_RATIO,
} from "./tracker-arbiter";

// A 1080p frame, and a bench grip 0.55m wide filling a plausible slice of it. Working in a real
// frame size rather than a unit square matters: the whole reason this rule is expressed in
// pixels is that normalized space is anisotropic on anything that is not square, and a test on a
// square frame could not tell the two apart.
const W = 1920;
const H = 1080;
/** Wrists, normalized bottom-left-origin Vision convention, 0.2 of the frame width apart. */
const LEFT_WRIST = { x: 0.4, y: 0.5 };
const RIGHT_WRIST = { x: 0.6, y: 0.5 };
/** 0.2 * 1920 = 384px between the wrists. One yardstick. */
const YARDSTICK_PX = 384;

const yardstick = () =>
  bodyYardstickPx({
    leftWrist: LEFT_WRIST,
    rightWrist: RIGHT_WRIST,
    frameWidth: W,
    frameHeight: H,
  });

const verdictAt = (objectCenter: { x: number; y: number }) =>
  lockDistanceVerdict({
    objectCenter,
    anchor: handAnchor(LEFT_WRIST, RIGHT_WRIST),
    yardstick: yardstick(),
    frameWidth: W,
    frameHeight: H,
  });

describe("the body supplies the yardstick", () => {
  it("measures the grip in this frame's own pixels", () => {
    expect(yardstick()).toEqual({ px: YARDSTICK_PX, source: "grip" });
  });

  it("falls back to the shoulders when a wrist drops out", () => {
    // Ordinary on a real lift -- a hand passes behind the body, or one wrist reads below the
    // confidence floor for a stretch. Shoulder breadth is roughly a grip width and is broadside
    // in exactly the framing (supine, filmed from the foot of the bench) where length fails.
    const y = bodyYardstickPx({
      leftWrist: LEFT_WRIST,
      rightWrist: null,
      leftShoulder: { x: 0.42, y: 0.55 },
      rightShoulder: { x: 0.58, y: 0.55 },
      frameWidth: W,
      frameHeight: H,
    });
    expect(y?.source).toBe("shoulders");
    expect(y?.px).toBeCloseTo(0.16 * W, 6);
  });

  it("reports NO yardstick rather than a tiny one when the body reads too small", () => {
    // Two low-confidence joints that happened to land near each other look identical to an
    // athlete filmed from very far away. Dividing by the result turns every modest screen
    // distance into an enormous number of yardsticks and rejects every lock in the take, so the
    // honest answer is that the body did not supply a scale here.
    const y = bodyYardstickPx({
      leftWrist: { x: 0.5, y: 0.5 },
      rightWrist: { x: 0.5 + (MIN_YARDSTICK_PX - 4) / W, y: 0.5 },
      frameWidth: W,
      frameHeight: H,
    });
    expect(y).toBeNull();
  });

  it("does not let a shoulder span rescue a grip that was measured and was too small", () => {
    // The order is wrists, then shoulders -- but a grip UNDER the floor is not a usable grip, so
    // the shoulders still get their turn. The alternative (giving up because the wrists were
    // seen at all) would switch the gate off on exactly the frames it is needed.
    const y = bodyYardstickPx({
      leftWrist: { x: 0.5, y: 0.5 },
      rightWrist: { x: 0.505, y: 0.5 },
      leftShoulder: { x: 0.4, y: 0.55 },
      rightShoulder: { x: 0.6, y: 0.55 },
      frameWidth: W,
      frameHeight: H,
    });
    expect(y?.source).toBe("shoulders");
  });
});

describe("the anchor is the hands, never the shoulders", () => {
  it("uses the midpoint when both wrists are seen", () => {
    expect(handAnchor(LEFT_WRIST, RIGHT_WRIST)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("uses the one wrist there is when only one is seen", () => {
    expect(handAnchor(LEFT_WRIST, null)).toEqual(LEFT_WRIST);
    expect(handAnchor(null, RIGHT_WRIST)).toEqual(RIGHT_WRIST);
  });

  it("has nothing to anchor on when neither wrist was seen", () => {
    expect(handAnchor(null, null)).toBeNull();
  });
});

describe("the rule: is this object plausibly the one in the athlete's hands", () => {
  it("accepts a plate at the end of the bar", () => {
    // The real case that must never be rejected. A loaded plate's centre sits about 1.2 grip
    // widths out from the midpoint between the hands.
    const v = verdictAt({ x: 0.5 + (1.2 * YARDSTICK_PX) / W, y: 0.5 });
    expect(v.plausible).toBe(true);
    expect(v.distanceInYardsticks).toBeCloseTo(1.2, 5);
    expect(v.basis).toBe("yardstick");
  });

  it("rejects a plate on the rack behind the lifter", () => {
    // THE FAILURE THIS WHOLE FILE EXISTS FOR. Two metres away on a 0.55m grip is 3.6 yardsticks.
    const v = verdictAt({ x: 0.5 + (3.6 * YARDSTICK_PX) / W, y: 0.5 });
    expect(v.plausible).toBe(false);
    expect(v.distanceInYardsticks).toBeCloseTo(3.6, 5);
  });

  it("measures distance the same in any direction, on a frame that is not square", () => {
    // If this worked in normalized units instead of pixels, the same real displacement would
    // score 1.78x differently depending on whether it pointed across a 16:9 frame or up it, and
    // a lift filmed in portrait would be judged by a different standard from one in landscape.
    const across = verdictAt({ x: 0.5 + (2 * YARDSTICK_PX) / W, y: 0.5 });
    const up = verdictAt({ x: 0.5, y: 0.5 + (2 * YARDSTICK_PX) / H });
    expect(across.distanceInYardsticks).toBeCloseTo(up.distanceInYardsticks!, 5);
  });

  it("scales with the camera, which is the point of using the body as the ruler", () => {
    // The identical scene filmed from twice as far away: everything is half the pixels. A rule
    // in pixels or frame fractions would change its mind; this one must not, because nothing
    // about the lift changed.
    const near = verdictAt({ x: 0.5 + (3.6 * YARDSTICK_PX) / W, y: 0.5 });
    const farYardstick = bodyYardstickPx({
      leftWrist: { x: 0.45, y: 0.5 },
      rightWrist: { x: 0.55, y: 0.5 },
      frameWidth: W,
      frameHeight: H,
    });
    const far = lockDistanceVerdict({
      objectCenter: { x: 0.5 + (3.6 * (YARDSTICK_PX / 2)) / W, y: 0.5 },
      anchor: { x: 0.5, y: 0.5 },
      yardstick: farYardstick,
      frameWidth: W,
      frameHeight: H,
    });
    expect(far.distanceInYardsticks).toBeCloseTo(near.distanceInYardsticks!, 5);
    expect(far.plausible).toBe(near.plausible);
  });

  it("sits exactly on the documented threshold, so the constant is the behaviour", () => {
    const onIt = verdictAt({ x: 0.5 + (MAX_LOCK_DISTANCE_IN_YARDSTICKS * YARDSTICK_PX) / W, y: 0.5 });
    expect(onIt.plausible).toBe(true);
    const justPast = verdictAt({
      x: 0.5 + ((MAX_LOCK_DISTANCE_IN_YARDSTICKS + 0.01) * YARDSTICK_PX) / W,
      y: 0.5,
    });
    expect(justPast.plausible).toBe(false);
  });
});

describe("what it does when it cannot tell, which is pass", () => {
  // The asymmetry is load-bearing and is the thing most likely to get "tidied" later. A frame
  // with no athlete in it is ordinary -- the lifter steps out of shot, a pose read fails, the
  // camera is bumped -- and absence of a body reading is not evidence the object is wrong.
  // Failing those frames would reproduce, somewhere new, exactly the over-eagerness this cures.
  it("passes anything when there is no anchor at all", () => {
    const v = lockDistanceVerdict({
      objectCenter: { x: 0.99, y: 0.01 },
      anchor: null,
      yardstick: yardstick(),
      frameWidth: W,
      frameHeight: H,
    });
    expect(v.plausible).toBe(true);
    expect(v.basis).toBe("no_anchor");
    expect(v.distanceInYardsticks).toBeNull();
  });

  it("falls back to a deliberately loose frame fraction when there is no yardstick", () => {
    const near = lockDistanceVerdict({
      objectCenter: { x: 0.55, y: 0.5 },
      anchor: { x: 0.5, y: 0.5 },
      yardstick: null,
      frameWidth: W,
      frameHeight: H,
    });
    expect(near.plausible).toBe(true);
    expect(near.basis).toBe("frame_fraction");
    expect(near.distanceInYardsticks).toBeNull();

    // Still catches the other side of the room, which is all a fallback can honestly claim.
    const acrossTheRoom = lockDistanceVerdict({
      objectCenter: { x: 0.02, y: 0.98 },
      anchor: { x: 0.95, y: 0.05 },
      yardstick: null,
      frameWidth: W,
      frameHeight: H,
    });
    expect(acrossTheRoom.plausible).toBe(false);
  });

  it("passes on a frame with no usable dimensions rather than rejecting everything", () => {
    const v = lockDistanceVerdict({
      objectCenter: { x: 0.9, y: 0.9 },
      anchor: { x: 0.1, y: 0.1 },
      yardstick: null,
      frameWidth: 0,
      frameHeight: 0,
    });
    expect(v.plausible).toBe(true);
    expect(v.basis).toBe("no_anchor");
  });
});

describe("a reference object has to be the right shape AND in the right place", () => {
  const plateOnTheBar = {
    medianWidthPx: 200,
    medianHeightPx: 190,
    medianCenterXNorm: 0.5 + (1.2 * YARDSTICK_PX) / W,
    medianCenterYNorm: 0.5,
  };
  const check = (shape: typeof plateOnTheBar) =>
    referenceObjectVerdict({
      shape,
      anchor: handAnchor(LEFT_WRIST, RIGHT_WRIST),
      yardstick: yardstick(),
      frameWidth: W,
      frameHeight: H,
    });

  it("accepts a near-round plate out at the end of the bar", () => {
    const v = check(plateOnTheBar);
    expect(v.usable).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("accepts a plate foreshortened by an oblique camera angle", () => {
    // A disc viewed off-axis squashes along one axis only, and the scale read already takes the
    // LARGER axis as the diameter. Rejecting this would refuse most real side-on footage.
    const v = check({ ...plateOnTheBar, medianHeightPx: 200 / 2 });
    expect(v.usable).toBe(true);
    expect(v.aspectRatio).toBeCloseTo(2, 5);
  });

  it("rejects the rack upright that started all this", () => {
    // The read in the diagnostics that prompted the audit boxed at 3.12 -- a post, not a disc.
    const v = check({ ...plateOnTheBar, medianWidthPx: 593.94, medianHeightPx: 190.2 });
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain("aspect_ratio");
    expect(v.aspectRatio!).toBeGreaterThan(MAX_PLATE_ASPECT_RATIO);
  });

  it("rejects a perfectly round plate that belongs to somebody else's bar", () => {
    // Shape alone cannot catch this and never could: it IS a plate, it just is not this
    // athlete's. Only the body can answer it, which is the entire argument of this file.
    const v = check({ ...plateOnTheBar, medianCenterXNorm: 0.5 + (4 * YARDSTICK_PX) / W });
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain("too_far_from_athlete");
  });

  it("reports BOTH reasons when a read fails both ways", () => {
    // Wrong shape and wrong place call for different fixes -- retrain the model, or move the
    // camera -- so collapsing them to the first one found would throw away the diagnosis.
    const v = check({
      medianWidthPx: 600,
      medianHeightPx: 190,
      medianCenterXNorm: 0.5 + (4 * YARDSTICK_PX) / W,
      medianCenterYNorm: 0.5,
    });
    expect(v.reasons).toEqual(["aspect_ratio", "too_far_from_athlete"]);
  });

  it("does not refuse a read just because the body could not be measured", () => {
    // Same asymmetry as the per-frame rule. A bench filmed with the athlete's wrists out of shot
    // is the one take where the plate is the ONLY scale source, and refusing it there would take
    // the numbers away from precisely the case this feature was built to serve.
    const v = referenceObjectVerdict({
      shape: plateOnTheBar,
      anchor: null,
      yardstick: null,
      frameWidth: W,
      frameHeight: H,
    });
    expect(v.usable).toBe(true);
  });
});

/**
 * THE PORT HAS TO STAY A PORT.
 *
 * AvCoreMlImplementDetector runs this rule natively, because a lock has to be corrected mid-clip
 * and there is no Swift test target in this repo to run the rule against. That leaves the numbers
 * written down twice, which is the kind of duplication that silently rots -- somebody tunes the
 * threshold here against real footage, the phone keeps using the old one, and the take that
 * finally gets filmed to check the fix disproves a version of the code that is not running.
 *
 * So the Swift source is read and the constants are compared. This is a text scan and it knows
 * it: it cannot prove the two implementations BEHAVE the same, only that they were given the same
 * numbers. That is the half that actually drifts.
 */
describe("the Swift port carries the same numbers", () => {
  const swift = readFileSync(
    join(__dirname, "..", "ios", "App", "App", "AvBodyTrackingPlugin.swift"),
    "utf8",
  );

  const swiftConstant = (name: string): number | null => {
    const m = swift.match(new RegExp(`static let ${name}\\s*=\\s*(-?[0-9.]+)`));
    return m ? Number(m[1]) : null;
  };

  it.each([
    ["maxLockDistanceInYardsticks", MAX_LOCK_DISTANCE_IN_YARDSTICKS],
    ["fallbackLockDistanceFrameFraction", FALLBACK_LOCK_DISTANCE_FRAME_FRACTION],
    ["minYardstickPx", MIN_YARDSTICK_PX],
    ["maxYardstickDeviationRatio", MAX_YARDSTICK_DEVIATION_RATIO],
    ["minYardstickSamplesForStability", MIN_YARDSTICK_SAMPLES_FOR_STABILITY],
  ])("%s matches", (swiftName, tsValue) => {
    expect(swiftConstant(swiftName as string)).toBe(tsValue);
  });

  it("still applies the gate on every tracked frame, not only at re-classification", () => {
    // The continuous check is what actually fixes drift onto a rack plate: such a plate fails on
    // every frame, while a re-classification boundary comes round only twice a second. If this
    // ever gets "simplified" to run only at re-classification, the fix is mostly gone and
    // nothing else would notice.
    expect(swift).toMatch(/telemetry\.breaksWristGate \+= 1/);
    expect(swift).toContain("let call = arbitration(for: newBox, body: body)");
  });

  it("still checks the BODY before anything else the frame does", () => {
    // Both halves matter and they fail differently. The body check has to come before the
    // tracked-lock gate (or a jumped landmark convicts a good lock) AND before the fresh
    // detection (or a jumped wrist drags regionOfInterest with it and the detector seeds on
    // whatever happens to be in the wrong part of the image).
    const bodyCheck = swift.indexOf("var bodySuspectThisFrame = false");
    const abstain = swift.indexOf("if bodySuspectThisFrame { return nil }");
    const objectGate = swift.indexOf("let call = arbitration(for: newBox, body: body)");
    expect(bodyCheck).toBeGreaterThan(-1);
    expect(abstain).toBeGreaterThan(bodyCheck);
    expect(objectGate).toBeGreaterThan(abstain);
  });

  it("never lets a rejected body reading into the history it is judged against", () => {
    // A run of bad landmark frames would otherwise teach the stability check to accept them, and
    // the guard dissolves precisely when it is needed most. The append has to sit inside the
    // stable branch, not after it.
    expect(swift).toMatch(
      /if stability\.stable \{[\s\S]{0,400}?recentYardstickPx\.append\(yardstick\.px\)/,
    );
  });

  it("still filters detection candidates BEFORE choosing the most confident one", () => {
    // Order matters more than the filter does. Choosing first and checking afterwards throws
    // away a good second-place detection of the real implement whenever a better-lit duplicate
    // exists elsewhere in the room, which for "plate" in a gym is most takes.
    const filterIdx = swift.indexOf("let plausible = ofThisClass.filter");
    const maxIdx = swift.indexOf("guard let best = plausible.max");
    expect(filterIdx).toBeGreaterThan(-1);
    expect(maxIdx).toBeGreaterThan(filterIdx);
  });
});

describe("the referee blows the whistle on the body too", () => {
  // The gap the first version left, and the regression it introduced. Making the body the ruler
  // means a jumped wrist landmark can convict a perfectly good object lock, which is two parts
  // and a one-way hierarchy rather than three parts checking each other.
  const steady = [380, 384, 386, 382, 385, 384];

  it("accepts a span that only foreshortens as the athlete turns", () => {
    // The largest honest change available: a bar rotated well off square reads narrower. It must
    // not be mistaken for a landmark failure, or every angled take loses its object tracking.
    expect(bodyReadIsStable(384 * 0.55, steady).stable).toBe(true);
  });

  it("catches a wrist landmark that jumped somewhere a wrist cannot go", () => {
    const s = bodyReadIsStable(384 * 4, steady);
    expect(s.stable).toBe(false);
    expect(s.deviationRatio).toBeCloseTo(4, 5);
  });

  it("reports the deviation the same way whichever direction it went", () => {
    // One threshold has to cover a span that doubled and one that halved -- they are the same
    // failure and a signed ratio would need two constants to say so.
    expect(bodyReadIsStable(384 * 3, steady).deviationRatio).toBeCloseTo(
      bodyReadIsStable(384 / 3, steady).deviationRatio!,
      1,
    );
  });

  it("says nothing until there is enough history to have an opinion", () => {
    // Electing the first reading it saw as the truth is the mistake the rep-amplitude gate made.
    const s = bodyReadIsStable(9999, [380, 384]);
    expect(s.stable).toBe(true);
    expect(s.deviationRatio).toBeNull();
  });
});

describe("arbitrate: one call, both trackers, asymmetric response", () => {
  const steady = [380, 384, 386, 382, 385, 384];
  const call = (opts: {
    objectCenter: { x: number; y: number };
    yardstick?: { px: number; source: "grip" } | null;
    recent?: number[];
  }) =>
    arbitrate({
      objectCenter: opts.objectCenter,
      anchor: handAnchor(LEFT_WRIST, RIGHT_WRIST),
      yardstick: opts.yardstick === undefined ? yardstick() : opts.yardstick,
      recentYardstickPx: opts.recent ?? steady,
      frameWidth: W,
      frameHeight: H,
    });

  it("agrees when both trackers look right", () => {
    const a = call({ objectCenter: { x: 0.5 + (1.2 * YARDSTICK_PX) / W, y: 0.5 } });
    expect(a.outcome).toBe("agree");
    expect(a.breakLock).toBe(false);
  });

  it("breaks the lock for an object fault, with a steady body behind the verdict", () => {
    const a = call({ objectCenter: { x: 0.5 + (3.6 * YARDSTICK_PX) / W, y: 0.5 } });
    expect(a.outcome).toBe("object_suspect");
    expect(a.breakLock).toBe(true);
  });

  it("NEVER breaks the lock for a body fault -- the whole point of the asymmetry", () => {
    // The object is in exactly the place that would convict it above. It must not be convicted,
    // because the measurement that would do the convicting is the one that just went wrong.
    // There is no better body available, so the honest move is to judge nothing this frame.
    const a = call({
      objectCenter: { x: 0.5 + (3.6 * YARDSTICK_PX) / W, y: 0.5 },
      yardstick: { px: YARDSTICK_PX * 4, source: "grip" },
    });
    expect(a.outcome).toBe("body_suspect");
    expect(a.breakLock).toBe(false);
    expect(a.bodyDeviationRatio).toBeCloseTo(4, 5);
  });

  it("checks the body BEFORE the object, not after", () => {
    // Order is the design. If the object were judged first, a jumped landmark would already have
    // thrown the lock away by the time the jump was noticed -- the verdict would read
    // "object_suspect" and the lock would be gone. This asserts the opposite outcome on exactly
    // that input, which is the only way to tell the two orderings apart from outside.
    const a = call({
      objectCenter: { x: 0.99, y: 0.99 },
      yardstick: { px: YARDSTICK_PX / 5, source: "grip" },
    });
    expect(a.outcome).toBe("body_suspect");
  });

  it("abstains rather than guessing when there is no athlete to measure from", () => {
    const a = arbitrate({
      objectCenter: { x: 0.9, y: 0.9 },
      anchor: null,
      yardstick: null,
      recentYardstickPx: steady,
      frameWidth: W,
      frameHeight: H,
    });
    expect(a.outcome).toBe("cannot_judge");
    expect(a.breakLock).toBe(false);
  });
});
