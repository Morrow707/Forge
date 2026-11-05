"""THE BLIND SHOCK TEST.  Run against docs/anvil/blind-shock-spec-2026-11-05.md + Amendment 1.

Tests the Anvil's central claim: Forge predicts today's reading from load and sleep before the
athlete taps, and THE DISAGREEMENT IS THE USEFUL PART.

Everything below was declared in the committed spec BEFORE this file existed.  Nothing here is
free to be tuned after seeing a result.

    shock           15% of roster; ramp 3d, plateau 12d, exp decay tau 5d
    onset           uniform over the middle 60% of each athlete's own span
    magnitude       swept {0.5, 1.0, 1.5, 2.0} x NOISE   (A1: swept, never one value)
    sign            ADDED to v -- in this model a DEGRADED athlete reads HIGHER (A1.4)
    rho             leakage into SLEEP,  swept {0.0, 0.3, 0.6, 0.9}   (A1.1)
    lambda          leakage into LOAD,   swept {0.0, 0.3, 0.6}        (A1.2)
    null            no shock, same seeds -- sets the false-positive floor
    detectors       1 fast (unchanged), 2 slow (unchanged), 3 sleep-only, 4 Converge
    criteria        arm A (rho=0): Converge above the null floor by > both spreads
                    arm B (rho>0): Converge above SLEEP-ONLY by > both spreads
                    falsification stated in advance and not renegotiable

TWO THINGS DECLARED HERE BECAUSE THE SPEC DID NOT PIN THEM, both before any run:

  * SCALES.  rho is the fraction of a full 1.0 SD sleep degradation (so rho=0.6 reproduces the
    original hand-picked -0.6 SD, now as one point on a sweep).  lambda is the fraction of a
    full 25% training-volume reduction.
  * SEEDS.  12 football seasons, not 4.  125 athletes x 15% = ~19 shocked per season; 4 seasons
    put a 12-cell sweep on near-single-athlete granularity, which this project has been burned
    by three times.  More seeds only sharpens the estimate; it cannot choose the answer.

AND ONE CORRECTION TO THE SPEC'S OWN WORDING, in service of the spec's stated purpose.  Sec 4
says Converge carries "load and sleep, both as window-mean minus anchor-mean".  But detector 2
as committed uses the RAW window-mean load, not a difference.  Changing it would make Converge
differ from the slow channel by TWO things and break the guarantee that matters -- "detector 4
is detector 2 plus one column, so any difference is attributable to the sleep term and nothing
else".  The guarantee governs: load enters exactly as detector 2 has it, sleep is the new column.
"""
import sys, json, random, math, statistics as st
from collections import defaultdict

# ----- the committed detector's definitions, loaded not copied (compare.py runs at import)
def _defs():
    src = open("compare.py").read(); cut = src.index("\nprint(")
    ns = {"__name__": "compare_defs"}; exec(compile(src[:cut], "compare.py", "exec"), ns)
    assert {"load", "acute", "chronic", "NOISE", "FRAC_FROM", "FRAC_TO"} <= set(ns)
    return ns
C = _defs()
NOISE, FF, FT = C["NOISE"], C["FRAC_FROM"], C["FRAC_TO"]

SEEDS  = (1125, 2026, 4419, 7731, 8810, 8811, 8812, 8813, 8814, 8815, 8816, 8817)
DAYS, W = 159, 45
SHARE, RAMP, PLAT, TAU = 0.15, 3, 12, 5.0
MAGS   = (0.5, 1.0, 1.5, 2.0)
RHOS   = (0.0, 0.3, 0.6, 0.9)
LAMS   = (0.0, 0.3, 0.6)
SLEEP_SD_AT_RHO1, LOAD_FRAC_AT_LAM1 = 1.0, 0.25

def profile(d):
    """0 before onset, linear to 1 over RAMP, flat for PLAT, exp decay after"""
    if d < 0: return 0.0
    if d < RAMP: return (d + 1) / RAMP
    if d < RAMP + PLAT: return 1.0
    return math.exp(-(d - RAMP - PLAT) / TAU)

def inject(by, mag, rho, lam, seed):
    """Returns (rows, set of shocked ids).  The shock ADDS to v (A1.4)."""
    rng = random.Random(seed * 7919 + int(mag * 1000) + int(rho * 100) + int(lam * 10))
    ids = sorted(by)
    shocked = set(rng.sample(ids, max(1, int(round(SHARE * len(ids))))))
    out = {}
    for i, rs in by.items():
        if i not in shocked or mag == 0:
            out[i] = rs; continue
        doys = [r["doy"] for r in rs]; lo, hi = doys[0], doys[-1]
        on = lo + rng.uniform(0.20, 0.80) * (hi - lo)
        sds = st.pstdev([r["slp"] for r in rs]) or 0.5
        new = []
        for r in rs:
            p = profile(r["doy"] - on)
            q = dict(r)
            if p > 0:
                q["v"]    = r["v"] + mag * NOISE * p
                q["slp"]  = r["slp"] - rho * SLEEP_SD_AT_RHO1 * sds * p
                q["load"] = r["load"] * (1 - lam * LOAD_FRAC_AT_LAM1 * p)
            new.append(q)
        out[i] = new
    return out, shocked

# ---------------------------------------------------------------- detectors 3 and 4
def _windows(by):
    """one (drift, load, sleep-deficit) point per athlete -- detector 2's own geometry"""
    af, at = int(DAYS * FF), int(DAYS * FT)
    pts = []
    for i, rs in by.items():
        anc = [r for r in rs if af <= r["doy"] < at]
        if len(anc) < max(15, 0.5 * (at - af)): continue
        last = max(r["doy"] for r in rs)
        win = [r for r in rs if r["doy"] > last - W]
        if len(win) < W * 0.7: continue
        pts.append((i,
                    st.mean([r["v"] for r in win]) - st.mean([r["v"] for r in anc]),
                    st.mean([r["load"] for r in win]),
                    st.mean([r["slp"] for r in anc]) - st.mean([r["slp"] for r in win])))
    return pts

def _robust_z(res):
    v = list(res.values()); m = st.median(v)
    mad = st.median([abs(x - m) for x in v]); sd = mad / 0.6745 if mad > 0 else st.pstdev(v)
    return {i: (x - m) / sd for i, x in res.items()} if sd > 0 else {i: 0.0 for i in res}

def sleep_only(by):
    """detector 3: the benchmark.  Sleep DEFICIT (anchor minus window), standardised the same
    way detector 2 standardises its residual, so the high tail is the bad tail in both."""
    pts = _windows(by)
    if len(pts) < 12: return {}
    return _robust_z({p[0]: p[3] for p in pts})

def converge(by):
    """detector 4: detector 2 PLUS ONE COLUMN.  OLS on (load, sleep deficit), no interaction."""
    pts = _windows(by)
    if len(pts) < 12: return {}
    n = len(pts)
    y  = [p[1] for p in pts]; x1 = [p[2] for p in pts]; x2 = [p[3] for p in pts]
    my, m1, m2 = st.mean(y), st.mean(x1), st.mean(x2)
    a = [v - m1 for v in x1]; b = [v - m2 for v in x2]; c = [v - my for v in y]
    saa = sum(v*v for v in a); sbb = sum(v*v for v in b); sab = sum(a[k]*b[k] for k in range(n))
    sac = sum(a[k]*c[k] for k in range(n)); sbc = sum(b[k]*c[k] for k in range(n))
    det = saa * sbb - sab * sab
    if abs(det) < 1e-18:                        # perfectly collinear: fall back to load alone
        b1 = sac / saa if saa > 0 else 0.0; b2 = 0.0
    else:
        b1 = (sbb * sac - sab * sbc) / det; b2 = (saa * sbc - sab * sac) / det
    return _robust_z({pts[k][0]: c[k] - (b1 * a[k] + b2 * b[k]) for k in range(n)})

def slow(by):
    z, _, _ = C["chronic"](by, DAYS, W); return z

# ---------------------------------------------------------------- scoring
def detect(z, shocked):
    """threshold pinned at the UNSHOCKED group's 90th centile -- a 10% FP floor by
    construction, exactly as compare.py::run does it.  Returns (detection%, fp%)."""
    clean = sorted(x for i, x in z.items() if i not in shocked)
    hot = [x for i, x in z.items() if i in shocked]
    if len(clean) < 10 or not hot: return None, None
    thr = clean[int(0.90 * len(clean))]
    return (100 * sum(1 for x in hot if x >= thr) / len(hot),
            100 * sum(1 for x in clean if x >= thr) / len(clean))

def spread(v): return (max(v) - min(v)) / 2 if len(v) > 1 else 0.0

def main():
    worlds = []
    for s in SEEDS:
        _, by, _ = C["load"](f"fb_{s}.json")
        worlds.append((s, by))
    print(f"\n  THE BLIND SHOCK TEST -- {len(worlds)} football seasons, "
          f"{sum(len(b) for _, b in worlds)} athletes, {int(SHARE*100)}% shocked\n")

    # ---- the null arm: does the floor land where the design says
    fp = []
    for s, by in worlds:
        _, sh = inject(by, 0.0, 0, 0, s)
        rng = random.Random(s); fake = set(rng.sample(sorted(by), int(SHARE * len(by))))
        for f in (slow, sleep_only, converge):
            d, p = detect(f(by), fake)
            if p is not None: fp.append(p)
    print(f"  NULL ARM (no shock): false-positive floor {st.mean(fp):.1f}% +-{spread(fp):.1f} "
          f"(design says 10%)\n")

    # ---- the fast channel depends only on magnitude (it reads neither load nor sleep)
    print("  FAST CHANNEL, for the arm-A criterion (single-day z>=2.0, flag rate on shocked)")
    row = "   "
    for mag in MAGS:
        per = []
        for s, by in worlds[:4]:
            bs, sh = inject(by, mag, 0, 0, s)
            a = C["acute"](bs)
            hot = [v for i, (v, _) in a.items() if i in sh]
            cl  = [v for i, (v, _) in a.items() if i not in sh]
            if hot and cl: per.append(st.mean(hot) - st.mean(cl))
        row += f"   {mag:g}x: +{st.mean(per):.2f}pp"
    print(row + "   (shocked minus clean flag rate)\n")

    # ---- the leakage surface
    for mag in MAGS:
        print(f"  MAGNITUDE {mag:g} x NOISE")
        print(f"  {'':<6}" + "".join(f"{f'lam={l:g}':>26}" for l in LAMS))
        print(f"  {'rho':<6}" + "".join(f"{'slow':>8}{'sleep':>9}{'CONV':>9}" for _ in LAMS))
        print("  " + "-" * (6 + 26 * len(LAMS)))
        for rho in RHOS:
            line = f"  {rho:<6.1f}"
            for lam in LAMS:
                acc = {"slow": [], "sleep": [], "conv": []}
                for s, by in worlds:
                    bs, sh = inject(by, mag, rho, lam, s)
                    for nm, f in (("slow", slow), ("sleep", sleep_only), ("conv", converge)):
                        d, _ = detect(f(bs), sh)
                        if d is not None: acc[nm].append(d)
                line += (f"{st.mean(acc['slow']):>7.0f}%"
                         f"{st.mean(acc['sleep']):>8.0f}%"
                         f"{st.mean(acc['conv']):>6.0f}+-{spread(acc['conv']):<2.0f}")
            print(line)
        print()

if __name__ == "__main__":
    main()
