"""THE DETECTOR FORM, CHOSEN BY A RULE RATHER THAN BY A FITTED BOUNDARY.

`form_by_sport.py` measured that the better form is sport-shaped: with 18% load spread across the
roster (football) the load regression HURTS and the roster median alone is better; at 39-40%
(baseball, basketball) regressing on the athlete's own load wins. Its selector is the load spread,
which means shipping a boundary somewhere between 18% and 39% fitted on two points -- the shape
CLAUDE.md refuses ("a scan that enumerates accepted forms", one level up).

So test the rule instead: compute BOTH residuals on the cohort in hand and keep the one with the
smaller spread. No boundary, no sport table, and a cohort nobody measured is handled the day it
arrives. Reported at a fixed z of 2.0 so the clean column is a real false-alarm rate.
"""
import random, statistics as st
from collections import defaultdict

def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "cd"}; exec(compile(src[:cut], "compare.py", "exec"), ns); return ns
C = _defs()
W, N_ANCHOR, Z, DRAWS, N = 45, 20, 2.0, 200, 90
WORLDS = dict(
    football=[f"fb_{s}.json" for s in (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)],
    baseball=[f"mlb2_{s}.json" for s in (2702, 3813, 4924, 6035)],
    basketball=[f"nba_{s}.json" for s in range(3001, 3041)],
)

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

def residuals(group, form):
    y = [p[1] for p in group]; x = [p[2] for p in group]
    if form == "load":
        mx, my = st.mean(x), st.mean(y)
        sxx = sum((v - mx) ** 2 for v in x)
        b = sum((x[k] - mx) * (y[k] - my) for k in range(len(group))) / sxx if sxx > 0 else 0.0
        return [y[k] - (my + b * (x[k] - mx)) for k in range(len(group))]
    med = st.median(y)
    return [v - med for v in y]

def rates(group, form):
    if form == "tighter":
        a, b = residuals(group, "load"), residuals(group, "roster")
        res = a if mad_sigma(a) < mad_sigma(b) else b
        chose_load = mad_sigma(a) < mad_sigma(b)
    else:
        res = residuals(group, form); chose_load = form == "load"
    m = st.median(res); sd = mad_sigma(res)
    if sd <= 0: return None
    z = [(r - m) / sd for r in res]
    clean = [z[k] for k in range(len(group)) if group[k][0] == "none"]
    dec = [z[k] for k in range(len(group)) if group[k][0] != "none"]
    if not clean or not dec: return None
    return (100 * sum(1 for a in clean if a >= Z) / len(clean),
            100 * sum(1 for a in dec if a >= Z) / len(dec), chose_load)

print(f"\n  THE FORM RULE: keep the residual that is STRICTLY tighter.  cohorts of {N}, {DRAWS} draws, z = {Z}\n")
print(f"  {'world':<12}{'form':<34}{'decliners':>11}{'clean':>8}{'worst':>8}{'chose load':>12}")
print("  " + "-" * 85)
for w, files in WORLDS.items():
    pool = []
    for f in files:
        _, by, kind = C["load"](f)
        pool += points(by, kind)
    for form, label in (("load", "regress on the athlete's own load"),
                        ("roster", "roster median only"),
                        ("tighter", "whichever residual is tighter")):
        rng = random.Random(7000 + hash(form) % 997)
        cl, dc, ch = [], [], []
        for _ in range(DRAWS):
            r = rates(rng.sample(pool, min(N, len(pool))), form)
            if not r: continue
            cl.append(r[0]); dc.append(r[1]); ch.append(1 if r[2] else 0)
        if not cl: continue
        print(f"  {w:<12}{label:<34}{st.mean(dc):>10.0f}%{st.mean(cl):>7.0f}%{max(cl):>7.0f}%"
              f"{100*st.mean(ch):>11.0f}%")
    print()
