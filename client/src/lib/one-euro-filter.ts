// One Euro Filter (Casiez, Roussel & Vogel, 2012) -- an adaptive low-pass
// filter that cuts jitter when a point is nearly still but backs off (less
// smoothing, less lag) the faster it moves. A fixed-window moving average
// -- what bar-tracking.ts already applies to the SAVED metrics after a set
// ends -- can't do that: wide enough to kill jitter at rest, it visibly
// lags a fast rep; narrow enough to keep up with a fast rep, it barely
// smooths anything. This is only ever used for what's drawn or read out
// live (the skeleton overlay, the bar-path trail, the live speed/tilt
// numbers) -- the actual recorded trace bar-tracking.ts scores a set from
// stays on raw landmarks, so this never changes a number a coach acts on,
// only how steady the live picture looks.
function smoothingAlpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

class ScalarOneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrevMs: number | null = null;

  constructor(
    private minCutoffHz: number,
    private beta: number,
    private dCutoffHz = 1,
  ) {}

  filter(x: number, tMs: number): number {
    if (this.xPrev == null || this.tPrevMs == null) {
      this.xPrev = x;
      this.tPrevMs = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrevMs) / 1000, 1 / 120);
    const dx = (x - this.xPrev) / dt;
    const dxSmoothed = this.dxPrev + smoothingAlpha(this.dCutoffHz, dt) * (dx - this.dxPrev);
    const cutoff = this.minCutoffHz + this.beta * Math.abs(dxSmoothed);
    const xSmoothed = this.xPrev + smoothingAlpha(cutoff, dt) * (x - this.xPrev);
    this.xPrev = xSmoothed;
    this.dxPrev = dxSmoothed;
    this.tPrevMs = tMs;
    return xSmoothed;
  }
}

/** Smooths a whole MediaPipe landmark array frame-to-frame -- one
 * independent filter per (landmark index, x/y/z), reused across calls so
 * each landmark's own filter sees its own continuous history. Works on
 * either normalized (image-space) or world (meters) landmarks since both
 * shapes carry x/y/z/visibility; visibility passes through unsmoothed
 * (smoothing a confidence score doesn't mean anything). Call `reset()`
 * whenever tracking restarts (a new set) so stale velocity estimates from
 * the previous set don't bleed into the first few frames of the next. */
export class PoseSmoother {
  private filters = new Map<string, ScalarOneEuroFilter>();

  // beta=0.4 is tuned to keep up with a fast concentric rep or a jump's
  // takeoff without visible lag; minCutoff=1 is enough to steady a
  // standing/setup pose. Both are just starting points, not derived from
  // measurement -- adjust here if the live view still looks jittery or
  // laggy in practice.
  constructor(
    private minCutoffHz = 1,
    private beta = 0.4,
  ) {}

  private filterFor(key: string): ScalarOneEuroFilter {
    let f = this.filters.get(key);
    if (!f) {
      f = new ScalarOneEuroFilter(this.minCutoffHz, this.beta);
      this.filters.set(key, f);
    }
    return f;
  }

  smooth<T extends { x: number; y: number; z: number }>(points: T[], tMs: number): T[] {
    return points.map((p, i) => ({
      ...p,
      x: this.filterFor(`${i}-x`).filter(p.x, tMs),
      y: this.filterFor(`${i}-y`).filter(p.y, tMs),
      z: this.filterFor(`${i}-z`).filter(p.z, tMs),
    }));
  }

  reset() {
    this.filters.clear();
  }
}
