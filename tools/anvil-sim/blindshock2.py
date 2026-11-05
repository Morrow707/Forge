"""SECONDARY, post-hoc, declared as such: the registered onset puts most shocks OUTSIDE the
window the slow channel reads.

The spec registered onset as uniform over the middle 60% of the season.  The detection window
is the LAST 45 days of 159, so a shock starting at 0.20 of the span is thirty days gone before
the window opens.  That depresses every detector and could be hiding the comparison rather than
making it.

So this is the same test with onset constrained to [0.62, 0.78] -- the plateau lands inside the
window.  It is NOT the registered test and does not replace it.  Its only job is to say whether
the primary's ordering survives when the shock is actually visible.  If the ordering flips, the
primary was underpowered and that is the finding; if it holds, the falsification is robust.
"""
import statistics as st, random
import blindshock as B

def inject_in_window(by, mag, rho, lam, seed):
    rng = random.Random(seed * 7919 + int(mag*1000) + int(rho*100) + int(lam*10))
    ids = sorted(by)
    shocked = set(rng.sample(ids, max(1, int(round(B.SHARE * len(ids))))))
    out = {}
    for i, rs in by.items():
        if i not in shocked or mag == 0: out[i] = rs; continue
        doys = [r["doy"] for r in rs]; lo, hi = doys[0], doys[-1]
        on = lo + rng.uniform(0.62, 0.78) * (hi - lo)          # <- the only change
        sds = st.pstdev([r["slp"] for r in rs]) or 0.5
        new = []
        for r in rs:
            p = B.profile(r["doy"] - on); q = dict(r)
            if p > 0:
                q["v"]    = r["v"] + mag * B.NOISE * p
                q["slp"]  = r["slp"] - rho * B.SLEEP_SD_AT_RHO1 * sds * p
                q["load"] = r["load"] * (1 - lam * B.LOAD_FRAC_AT_LAM1 * p)
            new.append(q)
        out[i] = new
    return out, shocked

worlds = [(s, B.C["load"](f"fb_{s}.json")[1]) for s in B.SEEDS]
print(f"\n  SECONDARY (post-hoc): shock onset forced into the detection window\n"
      f"  {len(worlds)} seasons, {sum(len(b) for _,b in worlds)} athletes\n")
for mag in (1.0, 2.0):
    print(f"  MAGNITUDE {mag:g} x NOISE")
    print(f"  {'':<6}" + "".join(f"{f'lam={l:g}':>26}" for l in B.LAMS))
    print(f"  {'rho':<6}" + "".join(f"{'slow':>8}{'sleep':>9}{'CONV':>9}" for _ in B.LAMS))
    print("  " + "-" * (6 + 26*len(B.LAMS)))
    for rho in B.RHOS:
        line = f"  {rho:<6.1f}"
        for lam in B.LAMS:
            acc = {"slow": [], "sleep": [], "conv": []}
            for s, by in worlds:
                bs, sh = inject_in_window(by, mag, rho, lam, s)
                for nm, f in (("slow", B.slow), ("sleep", B.sleep_only), ("conv", B.converge)):
                    d, _ = B.detect(f(bs), sh)
                    if d is not None: acc[nm].append(d)
            line += (f"{st.mean(acc['slow']):>7.0f}%{st.mean(acc['sleep']):>8.0f}%"
                     f"{st.mean(acc['conv']):>6.0f}+-{B.spread(acc['conv']):<2.0f}")
        print(line)
    print()
