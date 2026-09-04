// Android/web's OWN implement classifier -- the browser-side twin of
// AvCoreMlImplementDetector (AvBodyTrackingPlugin.swift), same trained weights
// (scripts/med-ball-detector/convert_to_onnx.py exports the exact same best.pt
// checkpoint convert_to_coreml.py does, just to ONNX instead of CoreML), but a
// deliberately SEPARATE implementation, not a shared one -- per explicit
// instruction, so retuning one platform's thresholds/cadence after real
// footage never silently retunes the other, same reasoning
// android-swing-tracking.ts and this file's own camera-overlord checks (see
// isImplausibleJump below) already follow.
//
// Runs via onnxruntime-web (WASM execution provider, same same-origin-hosted-
// not-CDN pattern copy-mediapipe-wasm.mjs already established -- see
// copy-onnxruntime-wasm.mjs), since the Android/web app is a browser/WebView,
// not a native binary -- there's no Core ML equivalent to call into here.
//
// Structural difference from the iOS twin worth calling out: Vision's
// VNTrackObjectRequest gives AvCoreMlImplementDetector a CHEAP per-frame
// appearance tracker to follow a lock between classifications, so it only
// re-runs the actual CoreML classifier on a fresh acquisition. Nothing
// equivalent exists in onnxruntime-web, and re-running a real YOLO model
// every sampled frame in WASM on a phone would be far too slow (an untested,
// but very safe, assumption -- Apple's Neural Engine and browser WASM are not
// remotely comparable). Instead, this reuses this app's OWN existing
// motion-diff search (findMotionCentroid, from implement-tracking.ts -- the
// same primitive ImplementTracker's own wrist-seeded tracking already uses)
// as the CHEAP per-frame continuity mechanism between periodic real
// re-classifications, giving this its own two-tier classify-then-track
// structure that mirrors the iOS twin's SHAPE without sharing its
// implementation.
// The "/wasm" subpath specifically (not the bare "onnxruntime-web" package
// entry) -- this file only ever requests the "wasm" execution provider, and
// the bare entry point bundles every backend (webgl/webgpu/node) into one
// much larger chunk. See copy-onnxruntime-wasm.mjs's own comment for the
// matching choice on which .wasm binaries actually get served.
import * as ort from "onnxruntime-web/wasm";
import { findMotionCentroid, type PixelPoint } from "./implement-tracking";

// Same 8-class order dataset.yaml defines and convert_to_onnx.py's own header
// comment documents -- classId in the model's raw output indexes into this
// array directly. Keep this in sync with dataset.yaml if the model is ever
// retrained with a different class set; nothing here reads dataset.yaml at
// runtime to confirm it, so a mismatch would silently mislabel every
// detection rather than fail loudly.
const CLASS_NAMES = [
  "med_ball", "plate", "baseball", "golf_ball", "tennis_ball", "kettlebell", "dumbbell", "barbell",
] as const;

const MODEL_URL = "/models/MedBallDetector.onnx";
const WASM_BASE_PATH = "/onnxruntime-wasm/";
const MODEL_INPUT_SIZE = 640;
// Empirically verified against this repo's own training images (see
// convert_to_onnx.py's header comment) -- output0 is [1, 300, 6], each row
// [x1, y1, x2, y2, confidence, classId] in PIXEL coordinates relative to the
// 640x640 letterboxed input, zero-padded past however many real detections
// exist this frame.
const MAX_DETECTIONS = 300;

// Same reasoning as AvCoreMlImplementDetector's own minDetectionConfidence --
// a detection this weak is more likely a false positive than a real implement.
// Untuned starting value, same "no real footage to calibrate against yet"
// caveat every heuristic constant in this codebase carries until real device
// testing gives actual numbers to react to.
const MIN_DETECTION_CONFIDENCE = 0.4;

// How many processed frames a held lock rides on motion-diff continuity alone
// before this re-runs the real classifier to correct drift or re-verify the
// class -- untuned, and deliberately much sparser than iOS ever needs to be
// (Vision's own tracker never needs a "re-verify" cadence at all, since it
// only ever loses lock outright, not silently drifts to the wrong class).
// Pure guess pending real timing data: an actual per-frame WASM inference
// cost on a real phone is what should set this, not assumed.
const RECLASSIFY_STRIDE = 5;
// How many consecutive frames a FRESH acquisition attempt can fail before
// giving up until the next stride tick -- keeps a completely-out-of-frame
// implement from spending a real classifier call every single frame.
const FRESH_DETECTION_STRIDE = 10;

export type PixelBox = { x0: number; y0: number; x1: number; y1: number };

export type WebImplementResult = {
  // Normalized 0-1, top-left origin -- same convention canvas-space code in
  // this codebase already uses (NOT Vision's bottom-left convention -- this
  // never touches Vision at all).
  box: PixelBox;
  confidence: number;
};

let sessionPromise: Promise<ort.InferenceSession | null> | null = null;

// Loaded once per page session and reused across every tracked set -- same
// "don't re-initialize the runtime on every Track Set tap" reasoning
// pose-tracking.ts's own getPoseLandmarker already established. Resolves
// null (never rejects) on any load failure -- a missing/corrupt model file
// should degrade to "this signal just isn't available," the same way
// AvCoreMlImplementDetector.isAvailable reads false when MedBallDetector
// isn't bundled, not a hard error blocking the whole tracked set.
function getSession(): Promise<ort.InferenceSession | null> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = WASM_BASE_PATH;
    sessionPromise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }).catch(() => null);
  }
  return sessionPromise;
}

// Scale-to-fit + center-pad to a square, preserving aspect ratio -- the
// standard YOLO "letterbox" preprocessing convention (ultralytics' own
// training/export pipeline uses it by default), not a naive stretch-to-
// square resize. A phone's own portrait camera frame (e.g. 720x1280) is far
// from square; skipping this would feed the model a systematically distorted
// view it was never trained to expect. Pads with (114,114,114) -- ultralytics'
// own default letterbox fill color, matching what the model saw during
// training exactly rather than an arbitrary choice like black or white.
function letterbox(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number,
): { scale: number; padX: number; padY: number } {
  const scale = Math.min(MODEL_INPUT_SIZE / sourceWidth, MODEL_INPUT_SIZE / sourceHeight);
  const scaledWidth = Math.round(sourceWidth * scale);
  const scaledHeight = Math.round(sourceHeight * scale);
  const padX = Math.floor((MODEL_INPUT_SIZE - scaledWidth) / 2);
  const padY = Math.floor((MODEL_INPUT_SIZE - scaledHeight) / 2);
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, padX, padY, scaledWidth, scaledHeight);
  return { scale, padX, padY };
}

// HWC RGBA (canvas ImageData's own layout) -> NCHW RGB float32 in [0,1] --
// the input layout/normalization convention (1, 3, 640, 640) the exported
// model's own graph expects, confirmed empirically against the real ONNX
// file (see convert_to_onnx.py's header comment), not assumed from
// documentation alone.
function toNchwTensor(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const size = width * height;
  const float32 = new Float32Array(3 * size);
  for (let i = 0; i < size; i++) {
    const srcIdx = i * 4;
    float32[i] = data[srcIdx] / 255; // R plane
    float32[size + i] = data[srcIdx + 1] / 255; // G plane
    float32[2 * size + i] = data[srcIdx + 2] / 255; // B plane
  }
  return new ort.Tensor("float32", float32, [1, 3, height, width]);
}

// Center-to-center normalized distance and area ratio between two boxes --
// same shape and reasoning as AvCoreMlImplementDetector's own boxDelta
// (AvBodyTrackingPlugin.swift), a deliberately independent copy per this
// file's own header comment, not a port sharing code across the language
// boundary (which isn't even possible here, but the VALUES below are chosen
// fresh too, not copied from the Swift side's own constants).
function boxDelta(a: PixelBox, b: PixelBox): { centerDistance: number; areaRatio: number } {
  const centerA = { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 };
  const centerB = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const centerDistance = Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const areaRatio = areaA > 0 && areaB > 0 ? Math.max(areaA, areaB) / Math.min(areaA, areaB) : 1;
  return { centerDistance, areaRatio };
}

// Untuned starting thresholds, same caveat as every other heuristic constant
// in this file -- independently chosen from AvCoreMlImplementDetector's own
// maxPlausibleCenterJump/maxPlausibleAreaRatio, not copied, per this file's
// own header comment on why the two platforms stay separately tunable.
const MAX_PLAUSIBLE_CENTER_JUMP = 0.35;
const MAX_PLAUSIBLE_AREA_RATIO = 3.0;

// Camera overlord: a from-scratch analogue of AvCoreMlImplementDetector's own trajectory check
// (AvBodyTrackingPlugin.swift, VNDetectTrajectoriesRequest) -- Vision's free-flight parabola
// fitter is a black-box CV algorithm with no browser equivalent, so this fits the same underlying
// physics itself instead: real projectile motion (gravity-only, no thrust) traces y = a*t^2+b*t+c
// and x = d*t+e almost exactly, while a lock that's drifted onto a different nearby object (the
// same "a plate in the background looks like the med ball" failure mode isImplausibleJump above
// already guards against, from a different angle) does not. An independent, physics-based signal
// from the box-consistency check above (appearance/position-continuity based), wired in ALONGSIDE
// it in track() below, not as a replacement -- same "only ever adds scrutiny, never removes
// coverage" stance as the iOS twin: a clip too short to accumulate a confident fit, or one where
// the fit's own residual is too high to trust, simply skips this check for that frame, same as
// Vision's own trajectory request not firing yet.
//
// Deliberately its own separate implementation, not a port -- independently reasoned thresholds
// below, not copied from the Swift side's own constants, same "two platforms retune separately"
// stance this file's own header comment states.
const TRAJECTORY_MIN_POINTS = 5; // matches VNDetectTrajectoriesRequest's own default trajectoryLength
// Mean-squared fit residual (normalized box-coordinate units^2) above which the fitted curve
// doesn't actually look like a clean parabola/line -- untuned starting point, same "no real
// footage to calibrate against yet" caveat every heuristic constant in this file carries.
const TRAJECTORY_MAX_FIT_RESIDUAL = 0.001;

// Solves a small (n x n) linear system Ax = b via Gaussian elimination with partial pivoting --
// n is always 2 or 3 below (the tiny, well-conditioned normal-equations systems the quadratic/
// linear least-squares fits reduce to), so a plain elimination is both correct and fast enough to
// run every locked frame without pulling in a linear-algebra dependency for it.
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row) => row.slice());
  const rhs = b.slice();
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivotRow][col])) pivotRow = row;
    }
    if (Math.abs(m[pivotRow][col]) < 1e-10) return null;
    if (pivotRow !== col) {
      [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
      [rhs[col], rhs[pivotRow]] = [rhs[pivotRow], rhs[col]];
    }
    for (let row = col + 1; row < n; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < n; k++) m[row][k] -= factor * m[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let col = row + 1; col < n; col++) sum -= m[row][col] * x[col];
    x[row] = sum / m[row][row];
  }
  return x;
}

// Least-squares quadratic fit y = a*t^2 + b*t + c via the standard normal-equations system.
function fitQuadratic(t: number[], y: number[]): { a: number; b: number; c: number } | null {
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, sy0 = 0, sy1 = 0, sy2 = 0;
  const s0 = t.length;
  for (let i = 0; i < s0; i++) {
    const ti = t[i], yi = y[i], ti2 = ti * ti;
    s1 += ti; s2 += ti2; s3 += ti2 * ti; s4 += ti2 * ti2;
    sy0 += yi; sy1 += ti * yi; sy2 += ti2 * yi;
  }
  const solved = solveLinearSystem(
    [
      [s4, s3, s2],
      [s3, s2, s1],
      [s2, s1, s0],
    ],
    [sy2, sy1, sy0],
  );
  return solved ? { a: solved[0], b: solved[1], c: solved[2] } : null;
}

// Least-squares linear fit x = d*t + e.
function fitLinear(t: number[], x: number[]): { d: number; e: number } | null {
  let s1 = 0, s2 = 0, sx0 = 0, sx1 = 0;
  const s0 = t.length;
  for (let i = 0; i < s0; i++) {
    s1 += t[i]; s2 += t[i] * t[i];
    sx0 += x[i]; sx1 += t[i] * x[i];
  }
  const solved = solveLinearSystem(
    [
      [s2, s1],
      [s1, s0],
    ],
    [sx1, sx0],
  );
  return solved ? { d: solved[0], e: solved[1] } : null;
}

export class WebImplementDetector {
  private canvas: HTMLCanvasElement | null = null;
  private grayCanvas: HTMLCanvasElement | null = null;

  private lockedBox: PixelBox | null = null;
  private lockedLabel: string | null = null;
  private lockConfidence = 0;
  private framesSinceClassify = 0;
  private framesSinceFreshAttempt = 0;
  private prevGray: Uint8ClampedArray | null = null;
  // Camera overlord: recent boxes this detector has reported while locked --
  // see AvCoreMlImplementDetector's own recentBoxes comment for the full
  // "drifted onto a different, visually similar object" reasoning this
  // guards against. Independent implementation, same idea.
  private recentBoxes: PixelBox[] = [];
  private readonly boxHistoryWindow = 4;
  // Camera overlord: CONFIRMED (already-accepted) box centers with their own video.currentTime,
  // oldest first -- see the trajectory-fit helpers' own header comment above. Kept separate from
  // recentBoxes (which holds every accepted box, not just the ones this fits against) since the
  // fit needs real elapsed time between samples, not just a fixed frame count.
  private recentTrajectoryPoints: { t: number; x: number; y: number }[] = [];
  private readonly trajectoryHistoryWindow = TRAJECTORY_MIN_POINTS;
  // Classification itself is async (onnxruntime-web's session.run returns a
  // Promise); this guards against overlapping runs stacking up if a caller's
  // own per-frame loop ticks faster than one inference call resolves.
  private classifying = false;

  get isAvailable(): boolean {
    // Best-effort synchronous read -- getSession() itself is memoized, so a
    // caller checking this after the first track() call reflects whether
    // loading actually succeeded. Before that first call, this can't know
    // yet (loading is async) and reads false, same "not proven available
    // yet" caution AvCoreMlImplementDetector's own isAvailable doesn't have
    // to make (CoreML model presence is a synchronous bundle check).
    return this.loadedSession !== null;
  }
  private loadedSession: ort.InferenceSession | null = null;
  private loadAttempted = false;

  // Kicks off (or returns the in-flight/completed) model load -- callers
  // don't have to await this before calling track() (a frame during loading
  // just reads as "nothing detected yet, try again next tick"), but calling
  // it early (e.g. when a tracked set's setup screen first shows) means the
  // model is likely already warm by the time recording actually starts.
  async preload(): Promise<void> {
    this.loadAttempted = true;
    this.loadedSession = await getSession();
  }

  reset(): void {
    this.lockedBox = null;
    this.lockedLabel = null;
    this.lockConfidence = 0;
    this.framesSinceClassify = 0;
    this.framesSinceFreshAttempt = 0;
    this.prevGray = null;
    this.recentBoxes = [];
    this.recentTrajectoryPoints = [];
  }

  private getCanvas(): HTMLCanvasElement {
    if (!this.canvas) this.canvas = document.createElement("canvas");
    return this.canvas;
  }

  private getGrayCanvas(): HTMLCanvasElement {
    if (!this.grayCanvas) this.grayCanvas = document.createElement("canvas");
    return this.grayCanvas;
  }

  private isImplausibleJump(from: PixelBox, to: PixelBox): boolean {
    const delta = boxDelta(from, to);
    return delta.centerDistance > MAX_PLAUSIBLE_CENTER_JUMP || delta.areaRatio > MAX_PLAUSIBLE_AREA_RATIO;
  }

  private recordBox(box: PixelBox): void {
    this.recentBoxes.push(box);
    if (this.recentBoxes.length > this.boxHistoryWindow) this.recentBoxes.shift();
  }

  private recordTrajectoryPoint(video: HTMLVideoElement, box: PixelBox): void {
    this.recentTrajectoryPoints.push({ t: video.currentTime, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
    if (this.recentTrajectoryPoints.length > this.trajectoryHistoryWindow) this.recentTrajectoryPoints.shift();
  }

  // Only meaningful for a genuinely thrown, free-flying object -- gated to "med_ball"
  // specifically at the call site below, same reasoning AvCoreMlImplementDetector's own
  // detectTrajectory carries: barbell/dumbbell/kettlebell/plate stay gripped throughout their
  // tracked motion and are never in real free flight, so a parabola fit has nothing genuine to
  // find for them. Fits the PRIOR confirmed points (not including candidateBox -- deliberately
  // a forward prediction check, not a fit-then-test-a-point-already-in-the-fit check), then
  // compares the fit's own extrapolated position at this frame's timestamp against
  // candidateBox's actual tracked center. Returns false (never blocks) whenever there isn't
  // enough history yet or the fit itself doesn't look like a clean arc -- same "a trajectory not
  // firing this frame changes nothing" stance as the iOS twin.
  private isTrajectoryDisagreement(video: HTMLVideoElement, candidateBox: PixelBox): boolean {
    const points = this.recentTrajectoryPoints;
    if (points.length < TRAJECTORY_MIN_POINTS) return false;
    const t = points.map((p) => p.t);
    const quad = fitQuadratic(t, points.map((p) => p.y));
    const lin = fitLinear(t, points.map((p) => p.x));
    if (!quad || !lin) return false;

    let sse = 0;
    for (const p of points) {
      const fittedY = quad.a * p.t * p.t + quad.b * p.t + quad.c;
      const fittedX = lin.d * p.t + lin.e;
      sse += (p.y - fittedY) ** 2 + (p.x - fittedX) ** 2;
    }
    const residual = sse / points.length;
    if (residual > TRAJECTORY_MAX_FIT_RESIDUAL) return false; // doesn't look like a clean arc -- no opinion.

    const now = video.currentTime;
    const predictedY = quad.a * now * now + quad.b * now + quad.c;
    const predictedX = lin.d * now + lin.e;
    const candidateCenterX = (candidateBox.x0 + candidateBox.x1) / 2;
    const candidateCenterY = (candidateBox.y0 + candidateBox.y1) / 2;
    const disagreement = Math.hypot(candidateCenterX - predictedX, candidateCenterY - predictedY);
    return disagreement > MAX_PLAUSIBLE_CENTER_JUMP;
  }

  // Runs the real ONNX classifier against the full video frame, filtered to
  // targetLabel -- letterboxed (see letterbox's own comment), 300 candidate
  // rows read back and un-letterboxed into normalized 0-1 frame coordinates.
  // Returns the highest-confidence match for targetLabel specifically, same
  // "every other class's detection is real signal, just not for THIS call"
  // reasoning AvCoreMlImplementDetector's own track() already documents.
  private async classify(video: HTMLVideoElement, targetLabel: string): Promise<WebImplementResult | null> {
    if (!this.loadAttempted) await this.preload();
    const session = this.loadedSession;
    if (!session || video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = this.getCanvas();
    canvas.width = MODEL_INPUT_SIZE;
    canvas.height = MODEL_INPUT_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const { scale, padX, padY } = letterbox(ctx, video, video.videoWidth, video.videoHeight);
    const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const tensor = toNchwTensor(imageData);

    this.classifying = true;
    let output: ort.Tensor;
    try {
      const results = await session.run({ images: tensor });
      output = results["output0"];
    } catch {
      this.classifying = false;
      return null;
    }
    this.classifying = false;

    const targetClassIndex = CLASS_NAMES.indexOf(targetLabel as (typeof CLASS_NAMES)[number]);
    if (targetClassIndex === -1) return null;

    const data = output.data as Float32Array;
    let best: WebImplementResult | null = null;
    for (let i = 0; i < MAX_DETECTIONS; i++) {
      const base = i * 6;
      const confidence = data[base + 4];
      const classId = Math.round(data[base + 5]);
      if (classId !== targetClassIndex || confidence < MIN_DETECTION_CONFIDENCE) continue;
      if (best && confidence <= best.confidence) continue;
      // Un-letterbox: pixel coords in the 640x640 padded space -> original
      // video pixel space -> normalized 0-1. Same inverse of letterbox's own
      // forward transform.
      const x0 = (data[base] - padX) / scale / video.videoWidth;
      const y0 = (data[base + 1] - padY) / scale / video.videoHeight;
      const x1 = (data[base + 2] - padX) / scale / video.videoWidth;
      const y1 = (data[base + 3] - padY) / scale / video.videoHeight;
      best = { box: { x0, y0, x1, y1 }, confidence };
    }
    return best;
  }

  // Cheap per-frame continuity between real classifications -- reuses
  // findMotionCentroid (implement-tracking.ts) the same way ImplementTracker
  // itself already does, just anchored on the LAST DETECTED BOX's center
  // instead of a wrist. Returns a new box of the SAME size as the locked one,
  // re-centered on wherever the motion search landed -- this never re-checks
  // the class (same limitation VNTrackObjectRequest has, per
  // AvCoreMlImplementDetector's own comment on why its box-consistency check
  // exists at all), it only follows visual/motion continuity.
  private trackByMotion(video: HTMLVideoElement, lockedBox: PixelBox): PixelBox | null {
    const canvas = this.getGrayCanvas();
    const maxDim = 160;
    let w = maxDim;
    let h = Math.round((maxDim * video.videoHeight) / video.videoWidth);
    if (h > maxDim) {
      h = maxDim;
      w = Math.round((maxDim * video.videoWidth) / video.videoHeight);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const currGray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      currGray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const prevGray = this.prevGray;
    this.prevGray = currGray;
    if (!prevGray || prevGray.length !== currGray.length) return null;

    const centerX = ((lockedBox.x0 + lockedBox.x1) / 2) * w;
    const centerY = ((lockedBox.y0 + lockedBox.y1) / 2) * h;
    const centroid: PixelPoint | null = findMotionCentroid(currGray, prevGray, w, h, centerX, centerY);
    if (!centroid) return null;

    const shiftX = (centroid.x - centerX) / w;
    const shiftY = (centroid.y - centerY) / h;
    return {
      x0: lockedBox.x0 + shiftX,
      y0: lockedBox.y0 + shiftY,
      x1: lockedBox.x1 + shiftX,
      y1: lockedBox.y1 + shiftY,
    };
  }

  // Normalized 0-1, top-left origin box + confidence for targetLabel this
  // frame, or null when nothing confident was found -- same "caller falls
  // back to whatever else it has" contract as AvCoreMlImplementDetector's
  // own track(). targetLabel must be one of CLASS_NAMES; an unrecognized
  // label always returns null, same as AvCoreMlImplementDetector.targetLabel
  // returning nil for a trackingMode this model was never trained on.
  async track(video: HTMLVideoElement, targetLabel: string): Promise<WebImplementResult | null> {
    if (this.lockedLabel !== targetLabel) {
      this.lockedBox = null;
      this.lockedLabel = targetLabel;
      this.framesSinceClassify = 0;
      this.framesSinceFreshAttempt = 0;
    }

    if (this.lockedBox && this.framesSinceClassify < RECLASSIFY_STRIDE) {
      this.framesSinceClassify++;
      const tracked = this.trackByMotion(video, this.lockedBox);
      if (!tracked) {
        this.lockedBox = null;
        this.recentBoxes = [];
        this.recentTrajectoryPoints = [];
        return null;
      }
      if (this.recentBoxes.length > 0 && this.isImplausibleJump(this.recentBoxes[this.recentBoxes.length - 1], tracked)) {
        this.lockedBox = null;
        this.recentBoxes = [];
        this.recentTrajectoryPoints = [];
        return null;
      }
      if (targetLabel === "med_ball" && this.isTrajectoryDisagreement(video, tracked)) {
        this.lockedBox = null;
        this.recentBoxes = [];
        this.recentTrajectoryPoints = [];
        return null;
      }
      this.lockedBox = tracked;
      this.recordBox(tracked);
      this.recordTrajectoryPoint(video, tracked);
      return { box: tracked, confidence: this.lockConfidence };
    }

    if (this.classifying) return null; // a call is already in flight -- skip this tick rather than overlap.
    if (!this.lockedBox && this.framesSinceFreshAttempt < FRESH_DETECTION_STRIDE) {
      this.framesSinceFreshAttempt++;
      return null;
    }
    this.framesSinceFreshAttempt = 0;
    this.framesSinceClassify = 0;

    const result = await this.classify(video, targetLabel);
    if (!result) {
      this.lockedBox = null;
      this.recentBoxes = [];
      this.recentTrajectoryPoints = [];
      return null;
    }
    this.lockedBox = result.box;
    this.lockConfidence = result.confidence;
    this.recordBox(result.box);
    // A fresh classification is a genuine re-acquisition, not a continuation of whatever arc
    // came before it (the object could have been lost and reacquired anywhere) -- starts the
    // trajectory history over rather than mixing a pre-reacquisition point into a fit that's
    // supposed to represent one continuous flight.
    this.recentTrajectoryPoints = [];
    this.recordTrajectoryPoint(video, result.box);
    return result;
  }
}
