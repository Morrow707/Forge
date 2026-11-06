"""HOW OFTEN DOES THE ANVIL FLAG AN ATHLETE WHO IS FINE? Measured.

The two rules, as specified: flag at robust z >= 2.0 on one day, OR three
consecutive days at z >= 1.25. The z is computed against the athlete's OWN
rolling last 20 checks, using median and MAD (sigma = MAD/0.6745).

A textbook calculation uses the normal tail and says 2.0 is about 1 day in 44.
That calculation is wrong here for two reasons the design has to own:

  1. The baseline is ESTIMATED from 20 points, and MAD on 20 points is a very
     noisy estimate of scale (its asymptotic efficiency at the normal is ~37%).
     A z divided by a noisy sigma has much heavier tails than a standard normal.
  2. Real daily measures are autocorrelated. The run-of-three rule is the one
     that autocorrelation inflates, because runs are exactly what it counts.

So it is simulated: a season of an athlete whose true state NEVER changes.
Every flag below is false by construction.
"""
import random, math, statistics as st

def mad_sigma(xs):
    m = st.median(xs)
    return st.median([abs(x - m) for x in xs]) / 0.6745

def season(n_checks, phi, rng, baseline=20, z1=2.0, z2=1.25, run=3, oracle=False):
    """Returns (flagged_by_single, flagged_by_run, n_single, n_run)."""
    # an AR(1) series with unit marginal SD; phi=0 is white noise
    xs, prev = [], rng.gauss(0, 1)
    innov = math.sqrt(1 - phi * phi) if phi else 1.0
    for _ in range(baseline + n_checks):
        prev = phi * prev + rng.gauss(0, innov)
        xs.append(prev)
    singles, streak, runs = 0, 0, 0
    for i in range(baseline, len(xs)):
        hist = xs[i - baseline:i]
        if oracle:
            c, s = 0.0, 1.0           # the true centre and scale, known
        else:
            c, s = st.median(hist), mad_sigma(hist)
            if s <= 1e-9:
                continue
        z = abs(xs[i] - c) / s
        if z >= z1:
            singles += 1
        streak = streak + 1 if z >= z2 else 0
        if streak >= run:
            runs += 1
            streak = 0               # one alert per run, then re-arm
    return singles, runs

REPS = 20000
print("A SEASON OF AN ATHLETE WHOSE TRUE STATE NEVER CHANGES")
print("   every flag counted below is false\n")
print(f"  {'checks':>7} {'phi':>5} {'baseline':>9} | {'z>=2.0 flags':>13} {'% seasons >=1':>14} | {'run-of-3 flags':>15} {'% seasons >=1':>14}")
for n_checks, label in ((100, "5/wk x 20wk"), (140, "daily x 20wk")):
    for phi in (0.0, 0.3, 0.5):
        for oracle in (True, False):
            rng = random.Random(hash((n_checks, phi, oracle)) & 0xffffffff)
            S = [season(n_checks, phi, rng, oracle=oracle) for _ in range(REPS)]
            ms = sum(a for a, _ in S) / REPS
            mr = sum(b for _, b in S) / REPS
            ps = 100.0 * sum(1 for a, _ in S if a) / REPS
            pr = 100.0 * sum(1 for _, b in S if b) / REPS
            tag = "TRUE sd" if oracle else "roll-20"
            print(f"  {n_checks:>7} {phi:>5.1f} {tag:>9} | {ms:>13.1f} {ps:>13.1f}% | {mr:>15.1f} {pr:>13.1f}%")
    print()

print("WHAT A COACH SEES, for the 140-check season at phi=0.3 on a rolling-20 baseline:")
rng = random.Random(7)
S = [season(140, 0.3, rng) for _ in range(REPS)]
tot = [a + b for a, b in S]
print(f"  flags per athlete per season : mean {sum(tot)/REPS:.1f}, median {st.median(tot):.0f}, 90th pct {sorted(tot)[int(.9*REPS)]}")
print(f"  seasons with no flag at all  : {100.0*sum(1 for t in tot if t==0)/REPS:.1f}%")
print(f"  a roster of 30 such athletes : {30*sum(tot)/REPS:.0f} false flags a season, about one every {140*30/max(1e-9,30*sum(tot)/REPS):.1f} athlete-checks")
