"""IS "THE FIRST N CHECKS" AS GOOD AN ANCHOR AS "DAYS 8%-32% OF THE SEASON"?

The slow channel is a drift from a FIXED early-season anchor, and `randomanchor.py` has already
shown the anchor is the whole channel (16%/23% with it, 9-10% shuffled, random or absent -- the
clean floor). What it has not asked is which anchor Forge can actually build.

Every anchor in the sims is a DAY-OF-SEASON window: days 8% to 32%, needing at least
max(15, half those days) readings. Forge does not have that. An athlete's season phase is
reported (`anvil-athlete-state.ts`) but it is one word, not a calendar, and an athlete who starts
taking the check in week nine has no early-season readings to anchor on at all. So the shipped
anchor has to be defined on the athlete's OWN SERIES: their first N in-window checks.

  ARM A  day window     days 8%-32% of the season            [every sim to date]
  ARM B  first 20       the athlete's first 20 readings      [what Forge can build]
  ARM C  first 30       the athlete's first 30 readings
  ARM D  first 14       the athlete's first 14 readings
  ARM E  last 20 before the window   a ROLLING anchor        [the thing to refuse]

Arm E is in because it is the mistake: an anchor that re-learns itself is the fast channel's
measured defect one timescale up, and it is the shape somebody reaches for when an athlete's
first checks look unrepresentative.
"""
import random, statistics as st
from collections import defaultdict

def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "cd"}; exec(compile(src[:cut], "compare.py", "exec"), ns); return ns
C = _defs()
DAYS, W, FF, FT = 159, 45, C["FRAC_FROM"], C["FRAC_TO"]
SEEDS = (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)

def points(by, arm):
    """One athlete -> (id, window mean, anchor mean, window load), or dropped for thin data."""
    af, at = int(DAYS*FF), int(DAYS*FT)
    out = []
    for i, rs in by.items():
        rs = sorted(rs, key=lambda r: r["doy"])
        last = rs[-1]["doy"]
        win = [r for r in rs if r["doy"] > last - W]
        if len(win) < W*0.7: continue
        if arm == "day":
            anc = [r["v"] for r in rs if af <= r["doy"] < at]
            if len(anc) < max(15, 0.5*(at-af)): continue
        elif arm == "rolling":
            # The anchor is the twenty readings immediately BEFORE the window -- i.e. it moves.
            before = [r["v"] for r in rs if r["doy"] <= last - W]
            if len(before) < 20: continue
            anc = before[-20:]
        else:
            n = int(arm)
            # The anchor must END before the window starts, or the two share readings and the
            # difference is partly a number minus itself. The sims' windows are disjoint and
            # randomanchor.py says so in as many words; keep that true here.
            early = [r["v"] for r in rs if r["doy"] <= last - W]
            if len(early) < n: continue
            anc = early[:n]
        out.append((i, st.mean([r["v"] for r in win]), st.mean(anc),
                    st.mean([r["load"] for r in win])))
    return out

def detect(pts, kind):
    y = [p[1] - p[2] for p in pts]
    x = [p[3] for p in pts]
    mx, my = st.mean(x), st.mean(y)
    sxx = sum((v-mx)**2 for v in x)
    b = sum((x[k]-mx)*(y[k]-my) for k in range(len(pts)))/sxx if sxx > 0 else 0.0
    res = {pts[k][0]: y[k]-(my+b*(x[k]-mx)) for k in range(len(pts))}
    v = list(res.values()); m = st.median(v)
    mad = st.median([abs(a-m) for a in v]); sd = mad/0.6745 if mad > 0 else st.pstdev(v)
    if sd <= 0: return None
    z = {i: (a-m)/sd for i, a in res.items()}
    clean = sorted(z[i] for i in z if kind[i] == "none")
    if len(clean) < 10: return None
    thr = clean[int(0.90*len(clean))]
    out = {}
    for k in ("slow", "fast", "none"):
        g = [z[i] for i in z if kind[i] == k]
        out[k] = 100*sum(1 for a in g if a >= thr)/len(g) if g else 0.0
    out["n"] = len(pts)
    return out

loaded = []
for s in SEEDS:
    _, by, kind = C["load"](f"fb_{s}.json")
    loaded.append((s, by, kind))

print(f"\n  WHICH ANCHOR?  {len(loaded)} seasons\n")
print(f"  {'anchor':<34}{'athletes':>9}{'slow':>10}{'fast':>10}{'clean':>8}")
print("  " + "-" * 71)
for arm, label in (("day", "days 8%-32% of the season"),
                   ("20", "the athlete's first 20 readings"),
                   ("30", "the athlete's first 30 readings"),
                   ("14", "the athlete's first 14 readings"),
                   ("rolling", "the 20 readings before the window")):
    acc = defaultdict(list)
    for s, by, kind in loaded:
        r = detect(points(by, arm), kind)
        if r:
            for k in r: acc[k].append(r[k])
    if not acc:
        print(f"  {label:<34}{'--':>9}{'nothing to score':>28}")
        continue
    print(f"  {label:<34}{st.mean(acc['n']):>9.0f}{st.mean(acc['slow']):>9.0f}%"
          f"{st.mean(acc['fast']):>9.0f}%{st.mean(acc['none']):>7.0f}%")
print()
