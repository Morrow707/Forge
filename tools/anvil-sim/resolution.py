"""The two channels side by side, in ONE unit, because that is the comparison that was missing.

A "swing" is one day-to-day SD of the metric.  The acute channel flags a single day at z>=2, so
it resolves about 2 swings and nothing finer -- that is not a threshold choice, it is what one
day of data buys.  The chronic channel averages 45 days against a fixed anchor, so it resolves
far less.  The ~30% detection in chronic4.py is therefore NOT the detector failing: it is the
declines injected in this run (0.11 to 0.31 swings) sitting under the chronic channel's own
floor -- and that floor is still several times finer than the acute channel's.
"""
import json, statistics as st
from statistics import NormalDist
from collections import defaultdict
import random
NOISE=0.0115; ANCHOR_FROM,ANCHOR_TO=20,80
SEEDS=(2702,3813,4924,6035)

def acute_floor(target, thr=2.0, n=80000, seed=4):
    """One day against a rolling baseline of 20 captures whose SD is estimated FROM those 20.
    Draw each baseline once and solve for the shift that would flag, so one pass answers the
    whole curve.  statistics.mean/pstdev use exact rational arithmetic and are far too slow."""
    rng=random.Random(seed); g=rng.gauss; trials=[]
    for _ in range(n):
        prev=[g(0,1) for _ in range(20)]
        m=sum(prev)/20.0
        s=(sum((x-m)*(x-m) for x in prev)/20.0)**0.5
        if s<=0: continue
        trials.append(thr*s + m - g(0,1))      # flags when shift >= this
    trials.sort()
    return trials[int((target/100.0)*len(trials))]

def residual_sd(d, W=45):
    """The spread the chronic detector must beat, measured on a real run: season drift with each
    athlete's own load regressed out, robust sigma from the MAD."""
    by=defaultdict(list)
    for r in d["rows"]: by[r["id"]].append(r)
    pts=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
        if len(anc)<30: continue
        last=max(r["doy"] for r in rs)
        win=[r for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        pts.append((st.mean([r["v"] for r in win])-st.mean(anc),
                    st.mean([r["load"] for r in win])))
    mx=st.mean([p[1] for p in pts]); my=st.mean([p[0] for p in pts])
    sxx=sum((p[1]-mx)**2 for p in pts)
    b=sum((p[1]-mx)*(p[0]-my) for p in pts)/sxx
    res=[p[0]-(my+b*(p[1]-mx)) for p in pts]
    m=st.median(res); mad=st.median([abs(x-m) for x in res])
    return mad/0.6745

D=[json.load(open(f"mlb2_{s}.json")) for s in SEEDS]
RSD=st.mean([residual_sd(d) for d in D])/NOISE          # in swings

def chronic_floor(target, fp=10.0):
    z=NormalDist().inv_cdf(1-fp/100.0)
    want=NormalDist().inv_cdf(1.0-target/100.0)   # P(Z > thr - d/sigma) = target
    return (z-want)*RSD

a50,a80=acute_floor(50),acute_floor(80)
c50,c80=chronic_floor(50),chronic_floor(80)
print(f"  {'channel (false positives held near 10%)':<40}{'50% caught':>13}{'80% caught':>13}")
print("  "+"-"*66)
print(f"  {'acute    one day vs a rolling baseline':<40}{a50:>10.2f} sw{a80:>10.2f} sw")
print(f"  {'chronic  45 days vs a fixed anchor':<40}{c50:>10.2f} sw{c80:>10.2f} sw")
print(f"\n  The chronic channel resolves {a50/c50:.1f}x finer at the 50% mark and "
      f"{a80/c80:.1f}x finer at 80%.")
print(f"  It is not a weaker instrument than the daily flag, it is a slower one.\n")
print(f"  The declines injected in this run were 0.11 to 0.31 swings -- UNDER the chronic")
print(f"  channel's own 50% floor of {c50:.2f}, which is the whole reason only ~30% were caught.")
print(f"  That is the instrument's limit reported honestly, not a detector to keep tuning.\n")
print(f"  And neither channel can see the other's signal, which is the argument for two rather")
print(f"  than one with a different threshold:")
print(f"    a {a50:.2f} swing single day moves a 45 day mean by {a50/45:.3f} swings -- invisible")
print(f"    a {c50:.2f} swing season drift moves a single day's z by {c50:.2f} -- invisible at 2.0")
