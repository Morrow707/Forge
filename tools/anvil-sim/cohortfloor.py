"""HOW MANY ATHLETES DOES THE SLOW CHANNEL NEED BEFORE ITS z MEANS ANYTHING?

`ownsigma.py` establishes that the cohort is load-bearing rather than convenient: scored against
the athlete's own standard error the channel flags 0% of real decliners in football and 54% of
CLEAN athletes in baseball, because the across-athlete median is what removes the season's common
drift and the across-athlete MAD is what sets its scale. Neither is recoverable from one athlete.

`pooled.py` already measured that pooling does not make the channel FINER, and that a small roster
gives a noisy threshold (0.54 to 4.38 off one 18 man team). This asks the shipped question instead:
the channel scores at a FIXED z of 2.0 (`anvil-corroboration.ts`), so what is the real false-alarm
rate as a function of how many athletes the median and MAD were estimated from, and where does it
settle?

Subsamples are drawn WITHOUT replacement from the pooled athlete set of each world, 400 draws per
size, seeded. Reported as the mean clean rate and the worst draw, because the failure that matters
is the roster whose threshold came out wrong, not the average roster.
"""
import math, random, statistics as st
from collections import defaultdict

def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "cd"}; exec(compile(src[:cut], "compare.py", "exec"), ns); return ns
C = _defs()
W, N_ANCHOR, Z, DRAWS = 45, 20, 2.0, 400
WORLDS = dict(
    football=[f"fb_{s}.json" for s in (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)],
    baseball=[f"mlb2_{s}.json" for s in (2702, 3813, 4924, 6035)],
    basketball=[f"nba_{s}.json" for s in range(3001, 3041)],
)
SIZES = (6, 10, 15, 20, 30, 45, 60, 90, 150, 300)

def mad_sigma(xs):
    m = st.median(xs); mad = st.median([abs(x - m) for x in xs])
    return mad / 0.6745 if mad > 0 else (st.pstdev(xs) if len(xs) > 1 else 0.0)

def points(by, kind):
    out = []
    for i, rs in by.items():
        rs = sorted(rs, key=lambda r: r["doy"])
        last = rs[-1]["doy"]
        win = [r for r in rs if r["doy"] > last - W]
        early = [r for r in rs if r["doy"] <= last - W]
        if len(win) < W * 0.7 or len(early) < N_ANCHOR: continue
        out.append((kind[i],
                    st.mean([r["v"] for r in win]) - st.mean([r["v"] for r in early[:N_ANCHOR]]),
                    st.mean([r["load"] for r in win])))
    return out

def rates(group):
    """The clean and decliner flag rates for one cohort, scored at a fixed z."""
    y = [p[1] for p in group]; x = [p[2] for p in group]
    mx, my = st.mean(x), st.mean(y)
    sxx = sum((v - mx) ** 2 for v in x)
    b = sum((x[k] - mx) * (y[k] - my) for k in range(len(group))) / sxx if sxx > 0 else 0.0
    res = [y[k] - (my + b * (x[k] - mx)) for k in range(len(group))]
    m = st.median(res); sd = mad_sigma(res)
    if sd <= 0: return None
    z = [(r - m) / sd for r in res]
    clean = [z[k] for k in range(len(group)) if group[k][0] == "none"]
    dec = [z[k] for k in range(len(group)) if group[k][0] != "none"]
    if not clean: return None
    return (100 * sum(1 for a in clean if a >= Z) / len(clean),
            100 * sum(1 for a in dec if a >= Z) / len(dec) if dec else None)

print(f"\n  THE SLOW CHANNEL'S FALSE-ALARM RATE BY COHORT SIZE, at a fixed z of {Z}")
print(f"  {DRAWS} seeded draws per size, pooled across each world's seasons\n")
for w, files in WORLDS.items():
    pool = []
    for f in files:
        _, by, kind = C["load"](f)
        pool += points(by, kind)
    print(f"  {w} -- {len(pool)} athletes pooled")
    print(f"    {'cohort':>7}{'clean: mean':>13}{'worst draw':>12}{'decliners':>11}{'draws scored':>14}")
    print("    " + "-" * 57)
    for n in SIZES:
        if n > len(pool): continue
        rng = random.Random(1000 + n)
        cl, dc, ok = [], [], 0
        for _ in range(DRAWS):
            g = rng.sample(pool, n)
            r = rates(g)
            if not r: continue
            ok += 1; cl.append(r[0])
            if r[1] is not None: dc.append(r[1])
        if not cl: continue
        print(f"    {n:>7}{st.mean(cl):>12.0f}%{max(cl):>11.0f}%"
              f"{(f'{st.mean(dc):.0f}%' if dc else '--'):>11}{ok:>14}")
    print()
