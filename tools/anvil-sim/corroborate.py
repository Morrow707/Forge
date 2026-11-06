"""DOES REQUIRING THE CHANNELS TO AGREE FIX THE ALARM RATE? Measured.

falsealarm.py measured ~17 false flags an athlete a season at the thresholds as
specified. The obvious cure is a stricter threshold, and calibrate.py measures
what that costs: z>=3.5 gets to ~1.5 flags but only by refusing to speak.

There is a second lever the design already owns and does not spend. The design
record's own prescription screen says it: "Three of three agree. Nothing is
blended into one score. They are counted, because the weights between them are
unknown." That is this repo's Rule #4 for the camera, pointed at the Anvil --
"a number corroborated by one system is not a trusted number, it is an
assertion."

So: keep each channel's threshold where it is, and require CORROBORATION on the
day. Measured against the cost, which is real -- a channel that is absent
cannot corroborate, and on this product channels are absent constantly (Drive
needs a filmed set, the autonomic markers need a connected watch).
"""
import random, math, statistics as st

def mad_sigma(xs):
    m = st.median(xs)
    return st.median([abs(x - m) for x in xs]) / 0.6745 / 1.0420   # bias-corrected at n=20

def series(n, phi, rng, shift_from=None, shift=0.0):
    xs, prev = [], rng.gauss(0, 1)
    innov = math.sqrt(1 - phi * phi) if phi else 1.0
    for i in range(n):
        prev = phi * prev + rng.gauss(0, innov)
        v = prev + (shift if (shift_from is not None and i >= shift_from) else 0.0)
        xs.append(v)
    return xs

def channel_flags(xs, baseline, z1):
    """Which days this channel calls abnormal."""
    out = set()
    for i in range(baseline, len(xs)):
        h = xs[i - baseline:i]
        s = mad_sigma(h)
        if s <= 1e-9: continue
        if abs(xs[i] - st.median(h)) / s >= z1:
            out.add(i)
    return out

BASE, N, PHI, Z = 20, 140, 0.3, 2.0
REPS = 6000

def run(rule, present, shift=0.0, shift_from=None):
    """rule: how many channels must agree. present: per-channel availability."""
    rng = random.Random(hash((rule, tuple(present), shift)) & 0xffffffff)
    flags = 0
    for _ in range(REPS):
        sets = []
        for p in present:
            xs = series(BASE + N, PHI, rng, shift_from, shift)
            f = channel_flags(xs, BASE, Z)
            # a channel only speaks on the days it has data
            f = {d for d in f if rng.random() < p}
            sets.append(f)
        for d in range(BASE, BASE + N):
            spoke = sum(1 for s in sets if d in s or True)   # see note below
            agree = sum(1 for s in sets if d in s)
            if agree >= rule:
                flags += 1
    return flags / REPS

print("FALSE FLAGS AN ATHLETE A SEASON, each channel held at z>=2.0")
print("  (140 checks, phi=0.3, rolling-20 bias-corrected baseline)\n")
print(f"  {'channels present':>24} | {'1 of 3 (any)':>13} {'2 of 3':>9} {'3 of 3':>9}")
for name, present in (
    ("all three, every day", (1.0, 1.0, 1.0)),
    ("Temper 1.0 Drive .5 HRV .4", (1.0, 0.5, 0.4)),
    ("Temper 1.0 Drive .3 HRV .0", (1.0, 0.3, 0.0)),
):
    r1 = run(1, present); r2 = run(2, present); r3 = run(3, present)
    print(f"  {name:>24} | {r1:>13.1f} {r2:>9.1f} {r3:>9.2f}")

print("\nAND WHAT IT CATCHES: a real 1.5-SD drop in ALL THREE channels,")
print("held for 7 checks -- did the rule fire inside that window?")
print(f"  {'channels present':>24} | {'1 of 3':>8} {'2 of 3':>8} {'3 of 3':>8}")
def hit(rule, present, shift=-1.5):
    rng = random.Random(hash((rule, tuple(present), "hit")) & 0xffffffff)
    got = 0
    for _ in range(REPS):
        sets = []
        for p in present:
            xs = series(BASE + 7, PHI, rng, BASE, shift)
            f = {d for d in channel_flags(xs, BASE, Z) if rng.random() < p}
            sets.append(f)
        if any(sum(1 for s in sets if d in s) >= rule for d in range(BASE, BASE + 7)):
            got += 1
    return 100.0 * got / REPS
for name, present in (
    ("all three, every day", (1.0, 1.0, 1.0)),
    ("Temper 1.0 Drive .5 HRV .4", (1.0, 0.5, 0.4)),
    ("Temper 1.0 Drive .3 HRV .0", (1.0, 0.3, 0.0)),
):
    print(f"  {name:>24} | {hit(1,present):>7.1f}% {hit(2,present):>7.1f}% {hit(3,present):>7.1f}%")
