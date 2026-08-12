// A small, deliberately modest learned signal for implement tracking:
// remembers the average color of whatever ImplementTracker locked onto
// with full confidence for a given exercise, and offers that back as a
// soft corroboration signal the next time that exercise is tracked. This
// is NOT object detection and NOT a trained model -- there's no pretrained
// barbell/dumbbell/kettlebell detection model available (or trainable) in
// this offline-first client, see implement-tracking.ts's own header
// comment for why motion, not recognition, is this feature's foundation.
// Color alone, no shape/size/texture, and always blended in as a small
// confidence nudge (see bar-tracker-dialog.tsx's own use of
// appearanceSimilarity) -- never something tracking is gated on, since a
// wrong or stale memory should cost almost nothing, not break tracking.
//
// Persisted to localStorage rather than React state or a module-level
// variable specifically because it needs to survive the app being
// backgrounded or the tab being killed by the OS on mobile -- the same
// "close the app to check a form video, or change the song" workflow that
// motivated this in the first place -- not just resetting between sets
// within one open session.

export type ColorSignature = { r: number; g: number; b: number };

const STORAGE_KEY = "forge.implementAppearanceMemory.v1";
// A remembered signature is a running average of up to this many confirmed
// samples -- capped so switching to a different-colored bar or a new gym's
// equipment doesn't take dozens of sets to override a stale memory.
const MAX_SAMPLES = 40;

type MemoryEntry = ColorSignature & { sampleCount: number };
type MemoryStore = Record<string, MemoryEntry>;

function loadStore(): MemoryStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemoryStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: MemoryStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full, unavailable (private browsing), or SSR with no window
    // -- the memory just doesn't persist this time, no worse off than the
    // very first set ever tracked for this exercise.
  }
}

// key is caller-chosen (bar-tracker-dialog.tsx uses the exercise name) --
// this module has no opinion on what "the same implement" means, it just
// stores whatever it's given under whatever key it's given.
export function recordConfirmedAppearance(key: string, color: ColorSignature): void {
  if (typeof window === "undefined") return;
  const store = loadStore();
  const existing = store[key];
  if (!existing) {
    store[key] = { ...color, sampleCount: 1 };
  } else {
    const n = Math.min(existing.sampleCount, MAX_SAMPLES);
    store[key] = {
      r: (existing.r * n + color.r) / (n + 1),
      g: (existing.g * n + color.g) / (n + 1),
      b: (existing.b * n + color.b) / (n + 1),
      sampleCount: Math.min(existing.sampleCount + 1, MAX_SAMPLES),
    };
  }
  saveStore(store);
}

export function getRememberedAppearance(key: string): ColorSignature | null {
  if (typeof window === "undefined") return null;
  const entry = loadStore()[key];
  return entry ? { r: entry.r, g: entry.g, b: entry.b } : null;
}

// 0-1, 1 meaning identical average color -- RGB Euclidean distance
// normalized against the largest possible distance (black to white), so
// the result stays comparable across exercises regardless of how
// saturated or dark a given implement's color happens to be.
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);
export function appearanceSimilarity(sample: ColorSignature, remembered: ColorSignature): number {
  const distance = Math.hypot(sample.r - remembered.r, sample.g - remembered.g, sample.b - remembered.b);
  return Math.max(0, 1 - distance / MAX_RGB_DISTANCE);
}
