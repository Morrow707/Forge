"""RAISE THE THRESHOLD, OR REQUIRE THE CHANNELS TO AGREE? Measured head to head.

calibrate.py and corroborate.py each measured one route, on DIFFERENT shift
sizes and windows, so their numbers cannot be compared -- which is the error
this repo keeps writing down. Both routes are measured here on ONE scenario:

  a real 1.0-SD drop in every channel, held for 7 checks, and the question is
  whether anything fired inside that window, against the false-alarm rate over
  a 140-check season in which nothing happens at all.
"""
import random, math, statistics as st

C20 = 1.0420   # MAD/0.6745 runs 4% low at n=20; measured in calibrate.py

def sigma(xs): 
    m = st.median(xs)
    return st.median([abs(x-m) for x in xs]) / 0.6745 / C20

def flags(n, phi, rng, z1, shift=0.0, shift_from=None, p=1.0):
    """Days this channel calls abnormal. p = probability it has data that day."""
    xs, prev, out = [], rng.gauss(0,1), set()
    innov = math.sqrt(1-phi*phi) if phi else 1.0
    for i in range(20+n):
        prev = phi*prev + rng.gauss(0, innov)
        xs.append(prev + (shift if (shift_from is not None and i >= shift_from) else 0.0))
    for i in range(20, len(xs)):
        h = xs[i-20:i]; s = sigma(h)
        if s <= 1e-9: continue
        if abs(xs[i]-st.median(h))/s >= z1 and rng.random() < p:
            out.add(i)
    return out

PHI, REPS, SEASON, WIN, SHIFT = 0.3, 6000, 140, 7, -1.0

def measure(z1, need, present):
    rng = random.Random(hash((z1, need, tuple(present))) & 0xffffffff)
    false_per_season = 0
    for _ in range(REPS):
        sets = [flags(SEASON, PHI, rng, z1, p=p) for p in present]
        false_per_season += sum(1 for d in range(20, 20+SEASON)
                                if sum(1 for s in sets if d in s) >= need)
    caught = 0
    for _ in range(REPS):
        sets = [flags(WIN, PHI, rng, z1, SHIFT, 20, p) for p in present]
        if any(sum(1 for s in sets if d in s) >= need for d in range(20, 20+WIN)):
            caught += 1
    return false_per_season/REPS, 100.0*caught/REPS

print("ONE SCENARIO, BOTH ROUTES: a real 1.0-SD drop held 7 checks")
print("  false flags = over a 140-check season in which nothing happens\n")
print(f"  {'route':>38} | {'false/season':>12} {'caught':>8} {'caught per false':>17}")
rows = [
    ("one channel, z>=2.0 (as specified)", 2.0, 1, (1.0,)),
    ("one channel, z>=2.5",                2.5, 1, (1.0,)),
    ("one channel, z>=3.0",                3.0, 1, (1.0,)),
    ("one channel, z>=3.5",                3.5, 1, (1.0,)),
    ("ANY of 3 channels, z>=2.0",          2.0, 1, (1.0,1.0,1.0)),
    ("2 of 3 channels, z>=2.0",            2.0, 2, (1.0,1.0,1.0)),
    ("2 of 3 channels, z>=2.5",            2.5, 2, (1.0,1.0,1.0)),
    ("3 of 3 channels, z>=2.0",            2.0, 3, (1.0,1.0,1.0)),
    ("2 of 3, real availability .5/.4",    2.0, 2, (1.0,0.5,0.4)),
    ("2 of 3, Drive weekly only .2/.4",    2.0, 2, (1.0,0.2,0.4)),
]
best = None
for name, z1, need, present in rows:
    f, c = measure(z1, need, present)
    ratio = c/f if f > 0.05 else float('inf')
    print(f"  {name:>38} | {f:>12.1f} {c:>7.1f}% {ratio:>16.1f}")
