"""THE FPR-INFLATION CRITIQUE, MEASURED.

An adversarial review, 2026-11-05: max(slow, sleep-only) was reported with EACH channel pinned
at a 10% false-positive floor.  The OR of two 10% tests is not a 10% test -- it is up to
1-(1-.1)(1-.1) = 19% when the errors are independent, less when they correlate.  So the
replacement I proposed was compared against Converge at DOUBLE the false-alarm budget, and a
coach's morning list would have gone back up with it.  That is a real error in my conclusion.

This closes it.  The OR rule is pinned by bisection on a COMMON quantile until its combined
false-positive rate equals the single-detector floor, and only then is detection compared.
Converge keeps its 10%.  Apples to apples, finally.
"""
import statistics as st
import blindshock as B
from blindshock2 import inject_in_window

WORLDS = [(s, B.C["load"](f"fb_{s}.json")[1]) for s in B.SEEDS]
TARGET = 10.0

def or_rates(by, shocked, q):
    """flag if EITHER channel's value is at or above its own q-quantile of the clean group"""
    zs = (B.slow(by), B.sleep_only(by))
    ids = set(zs[0]) & set(zs[1])
    if len(ids) < 20: return None, None
    thr = []
    for z in zs:
        clean = sorted(z[i] for i in ids if i not in shocked)
        if len(clean) < 10: return None, None
        thr.append(clean[min(len(clean) - 1, int(q * len(clean)))])
    hot = [i for i in ids if i in shocked]; cl = [i for i in ids if i not in shocked]
    fire = lambda i: zs[0][i] >= thr[0] or zs[1][i] >= thr[1]
    if not hot: return None, None
    return (100 * sum(1 for i in hot if fire(i)) / len(hot),
            100 * sum(1 for i in cl if fire(i)) / len(cl))

def sweep(mag, rho, lam):
    shocked_sets = []
    for s, by in WORLDS:
        bs, sh = inject_in_window(by, mag, rho, lam, s)
        shocked_sets.append((bs, sh))
    def fp_at(q):
        v = [or_rates(bs, sh, q)[1] for bs, sh in shocked_sets]
        v = [x for x in v if x is not None]
        return st.mean(v) if v else 100.0
    lo, hi = 0.90, 0.999                       # quantile; higher = stricter
    for _ in range(18):
        mid = (lo + hi) / 2
        if fp_at(mid) > TARGET: lo = mid
        else: hi = mid
    q = (lo + hi) / 2
    det = [or_rates(bs, sh, q)[0] for bs, sh in shocked_sets]
    det = [x for x in det if x is not None]
    conv = []
    for bs, sh in shocked_sets:
        d, _ = B.detect(B.converge(bs), sh)
        if d is not None: conv.append(d)
    return q, fp_at(q), st.mean(det), B.spread(det), st.mean(conv), B.spread(conv)

print("\n  MAX(SLOW, SLEEP-ONLY) RE-PINNED TO A 10% COMBINED FALSE-POSITIVE RATE")
print("  vs CONVERGE at its own 10%.  12 seasons, shock inside the window.\n")
for mag in (1.0, 2.0):
    print(f"  MAGNITUDE {mag:g} x NOISE   (lambda = 0)")
    print(f"  {'rho':<6}{'quantile':>10}{'OR fp':>8}{'OR det':>14}{'CONVERGE':>14}{'verdict':>12}")
    print("  " + "-" * 64)
    for rho in B.RHOS:
        q, fp, d, ds, c, cs = sweep(mag, rho, 0.0)
        gap = d - c
        v = "OR wins" if gap > ds + cs else ("CONV wins" if -gap > ds + cs else "tied")
        print(f"  {rho:<6.1f}{q:>10.4f}{fp:>7.1f}%{d:>9.0f}+-{ds:<3.0f}{c:>9.0f}+-{cs:<3.0f}{v:>12}")
    print()
