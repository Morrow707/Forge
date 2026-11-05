"""DOES mean 1/RT BEAT THE MEDIAN AS THE ANVIL'S HEADLINE? Measured, not imported.

The PVT literature's recommended primary outcome is mean RECIPROCAL reaction time
(Basner & Dinges 2011), on the argument that 1/RT weights slow responses properly
without being dominated by them the way an arithmetic mean is, and without
discarding them the way a median does. The Anvil's headline is currently the
median of 25 trials.

That is a claim about a DIFFERENT instrument -- a 10-minute PVT with ~90 trials,
on dedicated hardware -- so it does not transfer by citation. What transfers is
the test: on 25 trials of realistic ex-Gaussian data, with a fatigue shift of the
shape the literature describes, which statistic separates rested from fatigued?

Fatigue's signature in the RT literature is mostly an inflated TAIL (tau) plus a
modest shift in mu, not a uniform slowing. That is what is simulated.
"""
import random, math, statistics as st

def exg(mu, sg, tau, rng):
    # ex-Gaussian: a normal core plus an exponential tail.
    return rng.gauss(mu, sg) + rng.expovariate(1.0 / tau)

def draw(n, mu, sg, tau, rng, lapse_p=0.0):
    out = []
    for _ in range(n):
        v = exg(mu, sg, tau, rng)
        if lapse_p and rng.random() < lapse_p:
            v += rng.expovariate(1.0 / 300.0)   # a lapse: a long extra pause
        out.append(max(120.0, v))
    return out

def harmonic(a):
    # 1 / mean(1/RT), i.e. mean reciprocal RT re-expressed in milliseconds so a
    # person can read it. A monotone transform of mean 1/RT, so it is the SAME
    # statistic for detection purposes and a readable one for a screen.
    return len(a) / sum(1.0 / x for x in a)

def amean(a): return sum(a) / len(a)

STATS = {"median": st.median, "mean": amean, "harmonic(=mean 1/RT)": harmonic}

def d(xs, ys):
    # Cohen's d on the sampling distribution of the statistic: how many SDs of
    # day-to-day noise apart the rested and fatigued days sit. This is exactly
    # what a z-scored channel divides by, so it IS the detection question.
    sx, sy = st.pstdev(xs), st.pstdev(ys)
    pooled = math.sqrt((sx * sx + sy * sy) / 2) or 1e-9
    return abs(amean(xs) - amean(ys)) / pooled

N_TRIALS, DRAWS = 25, 8000
RESTED = dict(mu=250, sg=25, tau=40)

SCENARIOS = [
    ("tail only      (tau 40->90)",      dict(mu=250, sg=25, tau=90), 0.0),
    ("tail + mu      (260, tau 90)",     dict(mu=260, sg=25, tau=90), 0.0),
    ("lapses only    (8% of trials)",    dict(mu=250, sg=25, tau=40), 0.08),
    ("uniform shift  (mu 250->280)",     dict(mu=280, sg=25, tau=40), 0.0),
]

rng = random.Random(20261105)
base = {k: [] for k in STATS}
for _ in range(DRAWS):
    a = draw(N_TRIALS, rng=rng, **RESTED)
    for k, f in STATS.items(): base[k].append(f(a))

print(f"{N_TRIALS} trials, {DRAWS} draws. Cohen's d between rested and each fatigue shape.")
print("Higher is better: it is the separation a z-scored channel divides by.\n")
print(f"{'scenario':32s}" + "".join(f"{k:>24s}" for k in STATS))
for name, pars, lp in SCENARIOS:
    fat = {k: [] for k in STATS}
    for _ in range(DRAWS):
        b = draw(N_TRIALS, rng=rng, lapse_p=lp, **pars)
        for k, f in STATS.items(): fat[k].append(f(b))
    row = "".join(f"{d(base[k], fat[k]):>24.3f}" for k in STATS)
    print(f"{name:32s}{row}")

print("\nDay-to-day noise in the statistic itself (SD over draws, rested):")
for k in STATS:
    print(f"  {k:24s} mean {amean(base[k]):7.1f} ms   SD {st.pstdev(base[k]):5.2f} ms")

# And the thing a screen has to survive: how far apart are the numbers an athlete
# would see? A headline that moves 40ms on the same data is a change somebody has
# to be told about rather than shipped quietly.
rng2 = random.Random(7)
one = draw(N_TRIALS, rng=rng2, **RESTED)
print("\nOne ordinary rested set, each statistic:")
for k, f in STATS.items():
    print(f"  {k:24s} {f(one):6.1f} ms")

# ---------------------------------------------------------------------------
# THE TEST THE SEPARATION TABLE ABOVE LEAVES OUT, and it is the one that decides
# this. The arithmetic mean beat mean 1/RT on the two tail-heavy shapes, which is
# the OPPOSITE of what the literature's argument predicts -- and the reason is
# that in those shapes the fatigue signal IS the tail, so being dominated by the
# tail is an advantage. The literature's objection to the arithmetic mean is not
# about sensitivity, it is that one distracted trial moves it.
#
# A phone buzzing, somebody saying your name, a dog: a single +400ms trial in 25
# is an ORDINARY event, not an edge case. The same argument settled the drift
# estimator (least squares reported -88ms of drift that did not happen; Theil-Sen
# capped at -20ms). So: how far does ONE distracted trial move each headline, in
# units of that headline's own day-to-day noise?
print("\n" + "=" * 78)
print("ONE DISTRACTED TRIAL. How far it moves each headline, in SDs of that")
print("headline's own day-to-day noise. Lower is better: this is error, not signal.")
print("=" * 78)
sd_of = {k: st.pstdev(base[k]) for k in STATS}
rng3 = random.Random(99)
for extra in (200, 400, 800):
    moves = {k: [] for k in STATS}
    for _ in range(DRAWS):
        clean = draw(N_TRIALS, rng=rng3, **RESTED)
        dirty = clean[:]
        dirty[rng3.randrange(N_TRIALS)] += extra
        for k, f in STATS.items():
            moves[k].append(abs(f(dirty) - f(clean)) / sd_of[k])
    row = "".join(f"{amean(moves[k]):>24.3f}" for k in STATS)
    print(f"{('+' + str(extra) + 'ms on one trial'):32s}{row}")

print("\nAnd the two held against each other: separation divided by the error one")
print("distraction introduces. This is the quantity that decides the headline.")
rng4 = random.Random(1234)
err = {}
for k, f in STATS.items():
    vals = []
    for _ in range(2000):
        clean = draw(N_TRIALS, rng=rng4, **RESTED)
        dirty = clean[:]; dirty[rng4.randrange(N_TRIALS)] += 400
        vals.append(abs(f(dirty) - f(clean)) / sd_of[k])
    err[k] = amean(vals)
print(f"\n{'scenario':32s}" + "".join(f"{k:>24s}" for k in STATS))
for name, pars, lp in SCENARIOS:
    fat = {k: [] for k in STATS}
    for _ in range(DRAWS):
        b = draw(N_TRIALS, rng=rng4, lapse_p=lp, **pars)
        for k, f in STATS.items(): fat[k].append(f(b))
    row = "".join(f"{d(base[k], fat[k]) / err[k]:>24.2f}" for k in STATS)
    print(f"{name:32s}{row}")
