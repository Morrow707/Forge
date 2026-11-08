"""CAN THE SLOW CHANNEL BE SCORED WITHOUT A ROSTER?

Every slow-channel sim to date normalises the drift by the MAD of the drift ACROSS ATHLETES, with
the athlete's own training load regressed out first. That needs a cohort, and `pooled.py` measured
how badly a small one behaves: the 90th-centile threshold taken off one 18 man team ranges 0.54 to
4.38. Forge today has ONE athlete taking the check. So if the cohort is load-bearing, the slow
channel cannot speak for the account it was built for, and `cannot_judge` is the right answer for
a season.

The alternative needs no cohort at all. The drift is a difference of two means, so its standard
error is the athlete's own day-to-day sigma times sqrt(1/n_window + 1/n_anchor) -- and that sigma
is already estimated per athlete by the fast channel's own baseline. z = drift / SE.

THE REASON IT MIGHT NOT WORK, which is the whole point of measuring it: that formula assumes the
readings are independent, and fatigue is slow, so neighbouring days are correlated and the true
standard error is LARGER than the formula says. Under-stating the SE over-states z, which means
more false alarms than the stated rate -- silently, in the direction that matters.

  ARM 1  cohort         across-athlete MAD of the load-regressed residual   [as simulated]
  ARM 2  own sigma      drift / (sigma_day * sqrt(1/nw + 1/na))             [needs no roster]
  ARM 3  own sigma, autocorrelation-corrected (effective n from lag-1 rho)

Reported at a FIXED z of 2.0, which is the threshold `anvil-corroboration.ts` already states, so
the clean column is the real false-alarm rate a shipped channel would have rather than one held at
10% by construction.
"""
import math, statistics as st
from collections import defaultdict

def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "cd"}; exec(compile(src[:cut], "compare.py", "exec"), ns); return ns
C = _defs()
W, N_ANCHOR, Z = 45, 20, 2.0
WORLDS = dict(
    football=([f"fb_{s}.json" for s in (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)], 159),
    baseball=([f"mlb2_{s}.json" for s in (2702, 3813, 4924, 6035)], 248),
    basketball=([f"nba_{s}.json" for s in range(3001, 3041)], 273),
)

def mad_sigma(xs):
    m = st.median(xs); mad = st.median([abs(x - m) for x in xs])
    return mad / 0.6745 if mad > 0 else (st.pstdev(xs) if len(xs) > 1 else 0.0)

def athlete_points(by):
    out = []
    for i, rs in by.items():
        rs = sorted(rs, key=lambda r: r["doy"])
        last = rs[-1]["doy"]
        win = [r for r in rs if r["doy"] > last - W]
        early = [r for r in rs if r["doy"] <= last - W]
        if len(win) < W * 0.7 or len(early) < N_ANCHOR: continue
        anc = early[:N_ANCHOR]
        wv = [r["v"] for r in win]; av = [r["v"] for r in anc]
        drift = st.mean(wv) - st.mean(av)
        # The athlete's own day-to-day sigma, measured the way the fast channel's baseline is:
        # MAD about the median, on the anchor window (which is what a shipped reading would have).
        sd = mad_sigma(av)
        # Lag-1 autocorrelation of the anchor readings, for the effective-n correction.
        if len(av) > 2:
            m = st.mean(av)
            num = sum((av[k] - m) * (av[k + 1] - m) for k in range(len(av) - 1))
            den = sum((x - m) ** 2 for x in av)
            rho = num / den if den > 0 else 0.0
        else:
            rho = 0.0
        out.append(dict(id=i, drift=drift, sd=sd, rho=max(-0.9, min(0.9, rho)),
                        nw=len(win), na=len(anc), load=st.mean([r["load"] for r in win])))
    return out

def z_cohort(pts):
    y = [p["drift"] for p in pts]; x = [p["load"] for p in pts]
    mx, my = st.mean(x), st.mean(y)
    sxx = sum((v - mx) ** 2 for v in x)
    b = sum((x[k] - mx) * (y[k] - my) for k in range(len(pts))) / sxx if sxx > 0 else 0.0
    res = [y[k] - (my + b * (x[k] - mx)) for k in range(len(pts))]
    m = st.median(res); sd = mad_sigma(res)
    return {pts[k]["id"]: (res[k] - m) / sd for k in range(len(pts))} if sd > 0 else {}

def z_own(pts, correct):
    out = {}
    for p in pts:
        if p["sd"] <= 0: continue
        nw, na = p["nw"], p["na"]
        if correct:
            # Effective sample size under AR(1): n_eff = n * (1-rho)/(1+rho).
            f = (1 - p["rho"]) / (1 + p["rho"]) if p["rho"] > -1 else 1.0
            nw, na = max(2.0, nw * f), max(2.0, na * f)
        se = p["sd"] * math.sqrt(1 / nw + 1 / na)
        out[p["id"]] = p["drift"] / se if se > 0 else 0.0
    return out

print(f"\n  SLOW CHANNEL, SCORED THREE WAYS, AT A FIXED z of {Z}\n")
print(f"  {'world':<12}{'normaliser':<40}{'slow':>7}{'fast':>7}{'clean':>7}")
print("  " + "-" * 73)
for w, (files, days) in WORLDS.items():
    arms = {"cohort (needs a roster)": defaultdict(list),
            "the athlete's own sigma": defaultdict(list),
            "own sigma, autocorrelation-corrected": defaultdict(list)}
    for f in files:
        _, by, kind = C["load"](f)
        pts = athlete_points(by)
        if len(pts) < 10: continue
        for label, z in (("cohort (needs a roster)", z_cohort(pts)),
                         ("the athlete's own sigma", z_own(pts, False)),
                         ("own sigma, autocorrelation-corrected", z_own(pts, True))):
            if not z: continue
            for k in ("slow", "fast", "none"):
                g = [z[i] for i in z if kind[i] == k]
                # A DECLINE is a drift in the slow direction; the sims' v is the metric itself,
                # and `compare.py`'s own detector flags HIGH residuals, so keep that sign.
                if g: arms[label][k].append(100 * sum(1 for a in g if a >= Z) / len(g))
    for label, acc in arms.items():
        if not acc: continue
        print(f"  {w:<12}{label:<40}{st.mean(acc['slow']):>6.0f}%{st.mean(acc['fast']):>6.0f}%{st.mean(acc['none']):>6.0f}%")
    print()
