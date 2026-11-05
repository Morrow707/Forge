"""Does the guard buy SENSITIVITY, or just a looser threshold?

contamination.py showed that excluding flagged captures from the baseline holds detection
across a sustained shock -- and also raised the no-shock floor.  Both are expected: removing
the upper tail from the baseline shrinks its SD, so every later z is larger.  So some of the
detection gain is a threshold shift wearing a fix's clothes.

This separates them.  The guarded threshold is re-pinned so its NO-SHOCK rate equals the
unguarded rule's no-shock rate, and only then is detection compared.  Apples to apples.
"""
import statistics as st
import contamination as C

FILES = [f"fb_{s}.json" for s in (1125, 2026, 4419, 7731)]
LOADED = [C.compare.load(f)[1] for f in FILES]

def floor_and_det(thr, runlen, guard, mag):
    """(no-shock rate, shocked rate) pooled over the whole 20-day block, 4 seasons."""
    out = []
    for by in LOADED:
        r, n = C.rates(by, mag, thr, runlen, guard)
        num = sum(r[b] * n[b] for b in C.BINS); den = sum(n[b] for b in C.BINS)
        out.append(num / den if den else 0.0)
    return st.mean(out)

def pin(target, runlen, guard, lo, hi):
    """bisect the guarded threshold until its no-shock rate matches the unguarded one"""
    for _ in range(22):
        mid = (lo + hi) / 2
        if floor_and_det(mid, runlen, guard, 0.0) > target: lo = mid
        else: hi = mid
    return (lo + hi) / 2

print("\n  DOES THE GUARD BUY SENSITIVITY OR JUST A LOOSER THRESHOLD?")
print("  guarded threshold re-pinned to the same no-shock rate, then detection compared.")
print("  rates pooled over the whole 20-day block, 4 seasons.\n")
for thr0, runlen, name in ((2.0, 1, "single day, z>=2.0"), (1.25, 3, "3 days running, z>=1.25")):
    base = floor_and_det(thr0, runlen, False, 0.0)
    thr1 = pin(base, runlen, True, thr0, thr0 + 2.5)
    g = floor_and_det(thr1, runlen, True, 0.0)
    print(f"  {name}")
    print(f"    unguarded thr {thr0:.3f} -> no-shock {base:5.2f}%")
    print(f"    guarded   thr {thr1:.3f} -> no-shock {g:5.2f}%   (matched)")
    print(f"    {'shock':<12}{'unguarded':>12}{'guarded':>12}{'gain':>10}")
    for mag in C.MAGS:
        u = floor_and_det(thr0, runlen, False, mag)
        q = floor_and_det(thr1, runlen, True, mag)
        print(f"    {f'{mag:g} x noise':<12}{u:>11.1f}%{q:>11.1f}%{q-u:>+9.1f}")
    print()
