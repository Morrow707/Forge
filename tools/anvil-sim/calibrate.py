"""WHY THE ROLLING BASELINE DOUBLES THE FLAG RATE, AND WHAT FIXES IT CHEAPEST.

falsealarm.py measured that a rolling-20 median/MAD baseline roughly DOUBLES the
single-day flag rate against knowing the true scale. Two separate causes, and
they want different fixes, so they are separated here:

  1. BIAS. sigma = MAD/0.6745 is the ASYMPTOTIC relation. On 20 points the MAD
     runs low, so the divisor runs low, so every z is inflated -- a systematic
     error, fixable with a finite-sample constant and nothing else.
  2. VARIANCE. Even unbiased, a scale estimated from 20 points wobbles, and a
     z divided by a wobbling scale has heavier tails than a normal. Not fixable
     by a constant; only by more baseline, a better estimator, or a threshold
     that admits the wobble (a t-like critical value rather than 2.0).
"""
import random, math, statistics as st

def mad_sigma(xs, c=0.6745):
    m = st.median(xs)
    return st.median([abs(x - m) for x in xs]) / c

rng = random.Random(11)
print("1. THE BIAS: what MAD/0.6745 actually estimates when sigma is 1.0")
print(f"  {'baseline n':>11} {'mean est. sigma':>16} {'bias':>8} {'correction needed':>19}")
CORR = {}
for n in (10, 14, 20, 30, 60, 120):
    e = [mad_sigma([rng.gauss(0, 1) for _ in range(n)]) for _ in range(200000)]
    m = sum(e) / len(e)
    CORR[n] = m
    print(f"  {n:>11} {m:>16.4f} {m-1:>+8.3f} {1.0/m:>19.4f}")
print("\n  At n=20 the scale runs about 4% low, so every z is about 4% high.")
print("  That alone moves a 2.0 threshold to an effective 1.92.\n")

def season(n_checks, phi, rng, baseline, corr, z1, z2, run, shift=0.0):
    xs, prev = [], rng.gauss(0, 1)
    innov = math.sqrt(1 - phi * phi) if phi else 1.0
    for _ in range(baseline + n_checks):
        prev = phi * prev + rng.gauss(0, innov)
        xs.append(prev)
    singles, streak, runs = 0, 0, 0
    for i in range(baseline, len(xs)):
        hist = xs[i - baseline:i]
        c, s = st.median(hist), mad_sigma(hist) / corr
        if s <= 1e-9: continue
        z = abs(xs[i] + shift - c) / s
        if z >= z1: singles += 1
        streak = streak + 1 if z >= z2 else 0
        if streak >= run: runs += 1; streak = 0
    return singles + runs

REPS = 20000
PHI, N = 0.3, 140
print("2. THE VARIANCE: false flags a season after the bias is corrected")
print(f"   ({N} checks, phi={PHI}; 'as specified' = z>=2.0 or three at z>=1.25)")
print(f"  {'baseline':>9} {'bias fix':>9} {'z single':>9} {'z run':>7} | {'false flags/season':>19}")
rows = []
for baseline in (20, 60):
    for fix in (False, True):
        corr = CORR[baseline] if fix else 1.0
        for z1, z2 in ((2.0, 1.25), (2.5, 1.6), (3.0, 2.0), (3.5, 2.25)):
            rng2 = random.Random(hash((baseline, fix, z1)) & 0xffffffff)
            f = sum(season(N, PHI, rng2, baseline, corr, z1, z2, 3) for _ in range(REPS)) / REPS
            rows.append((baseline, fix, z1, z2, f))
            print(f"  {baseline:>9} {str(fix):>9} {z1:>9.2f} {z2:>7.2f} | {f:>19.1f}")
    print()

print("3. WHAT THE QUIETER THRESHOLD COSTS: detection of a real 1.0-SD drop")
print(f"  {'baseline':>9} {'z single':>9} {'z run':>7} | {'false/season':>13} {'% of real drops caught':>23}")
for baseline, fix, z1, z2, f in rows:
    if not fix: continue
    corr = CORR[baseline]
    rng3 = random.Random(hash((baseline, z1, "hit")) & 0xffffffff)
    # a 1.0-SD drop held for 5 checks: did ANY rule fire inside that window?
    hit = 0
    for _ in range(8000):
        base = season(5, PHI, rng3, baseline, corr, z1, z2, 3, shift=1.0)
        if base: hit += 1
    print(f"  {baseline:>9} {z1:>9.2f} {z2:>7.2f} | {f:>13.1f} {100.0*hit/8000:>22.1f}%")
