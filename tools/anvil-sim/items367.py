"""Items 3, 6 and 7 of the 2026-11-06 decision list, measured on one footing.

 3  the weekly claim: one channel, or two of three?
 6  part 1's SECOND number: which tail metric, and what per-person lapse threshold?
 7  part 4: what do three trials buy, and is a +/-6% dead band the right width?

Every metric is judged on TWO axes, which is the test that overturned mean 1/RT:
separation under a real shift, AND damage from one ordinary distraction. A metric
that separates well and moves half a flag on one dog barking is not usable on a
phone in a locker room.
"""
import random, math, statistics as st

MU, SG, TAU = 250.0, 24.0, 45.0
C = 0.6745

def exg(rng, mu=MU, sg=SG, tau=TAU):
    return rng.gauss(mu, sg) + rng.expovariate(1.0 / tau)

def mad_sigma(xs, n_corr):
    m = st.median(xs)
    return st.median([abs(x - m) for x in xs]) / C * n_corr

# ---------------------------------------------------------------- item 6
def lapse_count(trials, thr):
    return sum(1 for t in trials if t > thr)

def slow10(trials):
    k = max(1, round(len(trials) * 0.10))
    return st.fmean(sorted(trials)[-k:])

def item6(rng, reps=24000, n=25):
    """Per-person lapse threshold = baseline median + k * baseline sigma.
    Separation rested vs a tail-fattened (fatigued) draw, and the damage one
    +400ms trial does, both in units of the metric's own rested SD."""
    # a per-person baseline: 20 checks x 25 trials, rested
    base = [exg(rng) for _ in range(20 * n)]
    bmed, bsig = st.median(base), mad_sigma(base, 1.0431)
    print(f"  baseline median {bmed:.0f} ms, robust sigma {bsig:.0f} ms")
    print(f"  {'metric':<22}{'sep (d)':>9}{'1-trial damage':>16}{'sep/damage':>12}")
    cands = [("lapses k=1.5", bmed + 1.5 * bsig), ("lapses k=2.0", bmed + 2.0 * bsig),
             ("lapses k=2.5", bmed + 2.5 * bsig), ("lapses k=3.0", bmed + 3.0 * bsig),
             ("lapses 1.5x median", 1.5 * bmed), ("lapses 2.0x median", 2.0 * bmed)]
    out = {}
    for name, thr in cands:
        rest = [lapse_count([exg(rng) for _ in range(n)], thr) for _ in range(reps)]
        fat = [lapse_count([exg(rng, tau=90) for _ in range(n)], thr) for _ in range(reps)]
        dmg = []
        for _ in range(reps // 6):
            t = [exg(rng) for _ in range(n)]
            a = lapse_count(t, thr)
            t[rng.randrange(n)] += 400
            dmg.append(abs(lapse_count(t, thr) - a))
        sd = st.pstdev(rest) or 1e-9
        d = (st.fmean(fat) - st.fmean(rest)) / math.sqrt((st.pvariance(rest) + st.pvariance(fat)) / 2 or 1e-9)
        dm = st.fmean(dmg) / sd
        out[name] = (d, dm, d / dm if dm else float("inf"))
        print(f"  {name:<22}{d:>9.2f}{dm:>16.2f}{out[name][2]:>12.1f}")
    # the alternative tail metric
    rest = [slow10([exg(rng) for _ in range(n)]) for _ in range(reps)]
    fat = [slow10([exg(rng, tau=90) for _ in range(n)]) for _ in range(reps)]
    dmg = []
    for _ in range(reps // 6):
        t = [exg(rng) for _ in range(n)]
        a = slow10(t); t[rng.randrange(n)] += 400
        dmg.append(abs(slow10(t) - a))
    sd = st.pstdev(rest) or 1e-9
    d = (st.fmean(fat) - st.fmean(rest)) / math.sqrt((st.pvariance(rest) + st.pvariance(fat)) / 2)
    dm = st.fmean(dmg) / sd
    print(f"  {'slowest-10% mean':<22}{d:>9.2f}{dm:>16.2f}{d/dm:>12.1f}")

# ---------------------------------------------------------------- item 7
def item7(rng, reps=40000):
    """Tapping: one 10s trial vs three, and what dead band the day-to-day noise implies."""
    # a tap count is a rate with real between-day variation; model the day effect
    # explicitly (what the athlete can do today) plus within-trial noise.
    DAY, WITHIN = 0.045, 0.030    # relative SD: between-day, and trial-to-trial within a day
    def day(): return 62.0 * (1 + rng.gauss(0, DAY))
    def trial(d): return d * (1 + rng.gauss(0, WITHIN))
    print(f"  {'reported':<18}{'between-day CV':>16}{'dead band at 1 SD':>20}")
    for name, k, agg in [("one trial", 1, st.fmean), ("best of three", 3, max),
                         ("median of three", 3, st.median), ("mean of three", 3, st.fmean)]:
        vals = []
        for _ in range(reps):
            d = day()
            vals.append(agg([trial(d) for _ in range(k)]))
        cv = st.pstdev(vals) / st.fmean(vals)
        print(f"  {name:<18}{cv*100:>15.2f}%{cv*100:>19.1f}%")
    print(f"  floor from the day effect alone: {DAY*100:.1f}%")

# ---------------------------------------------------------------- item 3
def item3(rng, weeks=3000, per_week=5, shift=1.0, held_weeks=3, avail=(1.0, .55, .40)):
    """The WEEKLY claim. A week is flagged if its channel evidence clears the rule.
    Availability is per channel per day: fast is the check itself, slow needs a
    filmed lift, career needs a test that season."""
    def chan_week(sh, p):
        """z of the week's mean against a 20-check baseline, or None if no data."""
        got = [rng.gauss(sh, 1) for _ in range(per_week) if rng.random() < p]
        if not got: return None
        return st.fmean(got) * math.sqrt(len(got))
    def run(rule, z):
        false_w = real_w = 0
        for _ in range(weeks):
            zs = [chan_week(0.0, p) for p in avail]
            if rule(zs, z): false_w += 1
        for _ in range(weeks):
            hit = False
            for _w in range(held_weeks):
                zs = [chan_week(shift, p) for p in avail]
                if rule(zs, z): hit = True
            if hit: real_w += 1
        return false_w / weeks, real_w / weeks
    one = lambda zs, z: any(v is not None and v >= z for v in zs)
    two = lambda zs, z: sum(1 for v in zs if v is not None and v >= z) >= 2
    two_or_lone = lambda zs, z: (sum(1 for v in zs if v is not None and v >= z) >= 2
                                 or (sum(1 for v in zs if v is not None) == 1
                                     and any(v is not None and v >= z + 1.0 for v in zs)))
    print(f"  {'rule':<34}{'z':>5}{'false wk':>10}{'caught':>9}{'caught/false':>14}")
    for name, rule, zs_ in [("any one channel", one, [2.0, 2.5, 3.0, 3.5]),
                            ("two of three", two, [1.5, 2.0, 2.5]),
                            ("two of three, or a lone +1.0", two_or_lone, [1.5, 2.0, 2.5])]:
        for z in zs_:
            f, r = run(rule, z)
            ratio = r / f if f else float("inf")
            print(f"  {name:<34}{z:>5.1f}{f*100:>9.1f}%{r*100:>8.1f}%{ratio:>14.1f}")

if __name__ == "__main__":
    rng = random.Random(20261106)
    print("ITEM 6 -- part 1's second number")
    item6(rng)
    print("\nITEM 7 -- part 4, three trials and the dead band")
    item7(rng)
    print("\nITEM 3 -- the weekly claim")
    item3(rng)

# ---------------------------------------------------------------- supplements
def item6b(rng, reps=24000, n=25):
    """How low should k go, and where does a TAIL metric stop being one?"""
    base = [exg(rng) for _ in range(20 * n)]
    bmed, bsig = st.median(base), mad_sigma(base, 1.0431)
    print(f"  {'k':>5}{'baseline lapses/25':>21}{'sep (d)':>9}{'damage':>9}{'sep/damage':>12}")
    for k in (0.75, 1.0, 1.25, 1.5, 1.75, 2.0):
        thr = bmed + k * bsig
        rest = [lapse_count([exg(rng) for _ in range(n)], thr) for _ in range(reps)]
        fat = [lapse_count([exg(rng, tau=90) for _ in range(n)], thr) for _ in range(reps)]
        dmg = []
        for _ in range(reps // 6):
            t = [exg(rng) for _ in range(n)]
            a = lapse_count(t, thr); t[rng.randrange(n)] += 400
            dmg.append(abs(lapse_count(t, thr) - a))
        sd = st.pstdev(rest) or 1e-9
        d = (st.fmean(fat) - st.fmean(rest)) / math.sqrt((st.pvariance(rest) + st.pvariance(fat)) / 2)
        dm = st.fmean(dmg) / sd
        print(f"  {k:>5.2f}{st.fmean(rest):>21.2f}{d:>9.2f}{dm:>9.2f}{d/dm:>12.1f}")

def item7b(rng, reps=30000):
    """Tapping, the damage axis: one trial where the athlete fumbles or is interrupted."""
    DAY, WITHIN = 0.045, 0.030
    print(f"  {'reported':<18}{'CV':>8}{'damage, 1 bad trial':>22}{'CV/damage':>12}")
    for name, k, agg in [("one trial", 1, st.fmean), ("best of three", 3, max),
                         ("median of three", 3, st.median), ("mean of three", 3, st.fmean)]:
        clean, dmg = [], []
        for _ in range(reps):
            d = 62.0 * (1 + rng.gauss(0, DAY))
            ts = [d * (1 + rng.gauss(0, WITHIN)) for _ in range(k)]
            a = agg(ts)
            clean.append(a)
            bad = ts[:]; bad[rng.randrange(k)] *= 0.80      # a fumble costs 20% of that trial
            dmg.append(abs(agg(bad) - a))
        cv = st.pstdev(clean) / st.fmean(clean)
        dm = st.fmean(dmg) / st.pstdev(clean)
        print(f"  {name:<18}{cv*100:>7.2f}%{dm:>22.2f}{cv*100/dm if dm else 0:>12.2f}")
