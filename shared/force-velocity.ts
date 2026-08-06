export type LoadVelocityPoint = { date: string; loadKg: number; meanVelocityMps: number };

export type ForceVelocityProfile = {
  slope: number; // kg per (m/s), always negative for a real profile
  intercept: number; // L0 -- estimated max load (kg) at zero velocity
  v0: number; // estimated max velocity (m/s) at zero load
  rSquared: number;
};

// Ordinary least-squares fit of load (kg) against mean concentric bar
// velocity (m/s) -- the standard barbell "load-velocity profile." This is
// functionally the same relationship classic force-velocity profiling
// describes (force scales with load lifted against gravity), without
// needing the separate acceleration/body-mass inputs a jump-based
// Samozino-style protocol would require -- everything here already comes
// from what a normal tracked set records.
export function computeForceVelocityProfile(points: LoadVelocityPoint[]): ForceVelocityProfile | null {
  // Fitting a line through fewer than 3 points, or points with no real
  // spread in either axis, produces a number that looks precise but isn't
  // -- better to report "not enough data" than a fake-confident profile.
  if (points.length < 3) return null;
  const n = points.length;
  const xs = points.map((p) => p.meanVelocityMps);
  const ys = points.map((p) => p.loadKg);
  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xBar) * (ys[i] - yBar);
    den += (xs[i] - xBar) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  if (slope >= 0) return null; // Not a real inverse load-velocity relationship yet
  const intercept = yBar - slope * xBar;
  const v0 = -intercept / slope;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - yBar) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, v0, rSquared };
}
