"""THE ACWR TEST, TURNED ON THE ANVIL'S OWN SLOW CHANNEL.

Carbone et al. (J Clin Med 2022;11:5945) killed the acute:chronic workload ratio with one
move: replace the chronic denominator with a RANDOM number and see whether the metric still
predicts injury.  It did -- quartile-4 coefficient 0.90 (0.28, 1.51) for the real ACWR against
0.73 (0.12, 1.34) for the random one -- so the long window was adding nothing the short window
did not already carry.  Their words: "the ACWR is simply a way of rescaling the AL".

The Anvil's slow channel is a two-timescale comparison of the same family: the last 45 days
against a fixed early-season anchor.  So the same question is owed to it, and nobody has asked.

  ARM A  real        drift = mean(v in window) - mean(v in anchor)        [as shipped]
  ARM B  shuffled    the anchor means are permuted ACROSS athletes        [anchor kept, owner lost]
  ARM C  random      the anchor mean is drawn from the across-athlete distribution
  ARM D  no anchor   drift = mean(v in window) alone, unanchored

If B, C or D detects as well as A, the anchor is decoration and the slow channel is a
late-season mean wearing a difference's clothes.

ONE THING THE SAME PAPER ACQUITS THE ANVIL OF, checked in the source rather than assumed:
ACWR's acute week sits INSIDE its own 4-week chronic window, so numerator and denominator
share data -- mathematical coupling, which bites any nested-window design, ratio or not.
The Anvil's windows are DISJOINT: the anchor is days 12-50 of 159 and the window is the last
45, and the fast channel's baseline is rs[k-20:k], which excludes today.  No shared component.
"""
import random, statistics as st
from collections import defaultdict

def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "cd"}; exec(compile(src[:cut], "compare.py", "exec"), ns); return ns
C = _defs()
DAYS, W, FF, FT = 159, 45, C["FRAC_FROM"], C["FRAC_TO"]
SEEDS = (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)

def points(by):
    af, at = int(DAYS*FF), int(DAYS*FT)
    out = []
    for i, rs in by.items():
        anc = [r["v"] for r in rs if af <= r["doy"] < at]
        if len(anc) < max(15, 0.5*(at-af)): continue
        last = max(r["doy"] for r in rs)
        win = [r for r in rs if r["doy"] > last - W]
        if len(win) < W*0.7: continue
        out.append((i, st.mean([r["v"] for r in win]), st.mean(anc),
                    st.mean([r["load"] for r in win])))
    return out

def detect(pts, kind, arm, rng):
    ancs = [p[2] for p in pts]
    if arm == "shuffled":
        sh = ancs[:]; rng.shuffle(sh); ancs = sh
    elif arm == "random":
        m, s = st.mean(ancs), st.pstdev(ancs)
        ancs = [rng.gauss(m, s) for _ in ancs]
    elif arm == "none":
        ancs = [0.0]*len(ancs)
    y = [pts[k][1] - ancs[k] for k in range(len(pts))]
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
    return out

worlds = []
for s in SEEDS:
    _, by, kind = C["load"](f"fb_{s}.json")
    worlds.append((s, points(by), kind))
print(f"\n  IS THE ANVIL'S ANCHOR DOING ANYTHING?  {len(worlds)} seasons, "
      f"{sum(len(p) for _,p,_ in worlds)} athletes\n")
print(f"  {'anchor':<22}{'slow decliners':>16}{'fast decliners':>16}{'clean (floor)':>15}")
print("  " + "-" * 69)
for arm, label in (("real","as shipped"),("shuffled","shuffled across athletes"),
                   ("random","drawn at random"),("none","no anchor at all")):
    acc = defaultdict(list)
    for s, pts, kind in worlds:
        rng = random.Random(s*31+hash(arm) % 1000)
        r = detect(pts, kind, arm, rng)
        if r:
            for k in r: acc[k].append(r[k])
    sp = lambda v: (max(v)-min(v))/2
    print(f"  {label:<22}{st.mean(acc['slow']):>11.0f}%+-{sp(acc['slow']):<3.0f}"
          f"{st.mean(acc['fast']):>11.0f}%+-{sp(acc['fast']):<3.0f}"
          f"{st.mean(acc['none']):>11.0f}%")
