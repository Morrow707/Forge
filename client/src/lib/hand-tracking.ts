// Optional second model alongside Pose (see pose-tracking.ts) -- Pose gives
// one coarse wrist landmark per side; MediaPipe's Hand Landmarker gives 21
// points per hand (fingers, palm) at much higher precision, since all of
// its resolution budget is spent on just the hand region instead of
// spread across the athlete's whole body. Used here purely to sharpen the
// seed point implement-tracking.ts's motion-diff search starts from --
// not wired into any world-space (meters) math, since Hand Landmarker's
// own world landmarks are wrist-centered in a different coordinate frame
// than Pose's hip-centered ones, and reprojecting between them isn't
// worth the complexity for what this needs (a better 2D starting guess,
// not a replacement for Pose's velocity/ROM numbers).
//
// Real cost: a second model running every tracked frame, in tension with
// wanting tracking to run fast on a phone -- left optional (callers should
// treat a null landmarker or empty detection as "fall back to Pose alone")
// rather than required, for exactly that reason.
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_BASE_PATH = "/mediapipe-wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

// Loaded once per page session and reused across every tracked set, same
// as getPoseLandmarker. Callers should treat a rejected promise as "hand
// tracking isn't available this session" and keep going with Pose alone
// -- this is a refinement, never a requirement.
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      }),
    );
  }
  return handLandmarkerPromise;
}

// Wrist (0) plus the four knuckle/MCP joints (5, 9, 13, 17) -- averaging
// these approximates where a gripped bar or handle actually sits across
// the palm, closer than any single point: a fingertip would be off the
// grip entirely, and the wrist alone is exactly what Pose already gives,
// just coarser.
const PALM_BASE_INDICES = [0, 5, 9, 13, 17];

export function palmBaseCentroid(handLandmarks: NormalizedLandmark[]): { x: number; y: number } {
  const points = PALM_BASE_INDICES.map((i) => handLandmarks[i]);
  return {
    x: points.reduce((a, p) => a + p.x, 0) / points.length,
    y: points.reduce((a, p) => a + p.y, 0) / points.length,
  };
}

// Generous enough to cover both hands on a wide barbell grip relative to
// their shared Pose-derived midpoint, tight enough that an unrelated hand
// elsewhere in a crowded gym shouldn't match. Normalized image-space
// units (fraction of frame width/height), same as every landmark
// coordinate elsewhere in this codebase.
const MAX_MATCH_DISTANCE = 0.12;

// Refines a Pose-derived wrist/grip point using whichever detected
// hand(s) are close enough to trust as "this is that grip," rather than
// trusting MediaPipe's own Left/Right handedness label -- that label's
// sense depends on camera mirroring conventions this app doesn't control
// consistently across devices, while simple proximity to what Pose
// already located doesn't need to know handedness at all. Averages every
// match within range (both hands, for a two-handed grip) rather than
// picking just the closest one, so a barbell's two independent grip
// points both pull the estimate rather than only whichever hand happened
// to be nearer. Returns null when no detected hand is close enough to
// trust -- callers should fall back to the plain Pose-derived point.
export function refineGripPoint(
  handsLandmarks: NormalizedLandmark[][],
  poseNormX: number,
  poseNormY: number,
): { x: number; y: number } | null {
  const matches = handsLandmarks
    .map((hand) => palmBaseCentroid(hand))
    .filter((c) => Math.hypot(c.x - poseNormX, c.y - poseNormY) < MAX_MATCH_DISTANCE);
  if (matches.length === 0) return null;
  return {
    x: matches.reduce((a, p) => a + p.x, 0) / matches.length,
    y: matches.reduce((a, p) => a + p.y, 0) / matches.length,
  };
}
