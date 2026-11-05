"""IS THE DRIFT SLOPE GAMEABLE, AND HOW BADLY?

A review claims a 15-year-old can flatten the regression slope by deliberately slowing the
first few trials, and that a single early distraction does the same thing by accident.  Both
are the same property: in a least-squares slope the ENDPOINTS carry the most leverage.

Measured, not argued.  25 ex-Gaussian trials (mu 260, sigma 30, tau 45 -- a real RT shape, not
the Gaussian the harness uses), 20,000 draws.
"""
import random, statistics as st

N, DRAWS = 25, 20000
rng = random.Random(4242)

def trial_set(drift_ms=0.0):
    """ex-Gaussian RTs with a true linear drift of drift_ms from first trial to last"""
    out = []
    for i in range(N):
        g = rng.gauss(260, 30) + rng.expovariate(1 / 45.0)
        out.append(g + drift_ms * i / (N - 1))
    return out

def ols(y):
    n = len(y); mx = (n - 1) / 2; my = sum(y) / n
    sxx = sum((i - mx) ** 2 for i in range(n))
    sxy = sum((i - mx) * (y[i] - my) for i in range(n))
    return (sxy / sxx) * (n - 1) if sxx else 0.0

def theil_sen(y):
    """median of all pairwise slopes.  29% breakdown point: endpoint leverage cannot move it."""
    n = len(y)
    s = [(y[j] - y[i]) / (j - i) for i in range(n) for j in range(i + 1, n)]
    return st.median(s) * (n - 1)

print("\n  1 · HOW MUCH DOES ONE SLOW FIRST TRIAL MOVE THE REPORTED DRIFT?")
print(f"  {'added to trial 1':>18}{'OLS drift':>14}{'Theil-Sen':>14}{'median RT':>12}")
print("  " + "-" * 58)
for extra in (0, 100, 200, 400):
    o, t, m = [], [], []
    for _ in range(DRAWS // 10):
        y = trial_set(0.0); y[0] += extra
        o.append(ols(y)); t.append(theil_sen(y)); m.append(st.median(y))
    print(f"  {extra:>15} ms{st.mean(o):>12.1f}ms{st.mean(t):>12.1f}ms{st.mean(m):>10.0f}ms")

print("\n  2 · GAMING IT: slow the first THREE trials to flatten a real +40ms drift")
print(f"  {'slowed by':>18}{'OLS drift':>14}{'Theil-Sen':>14}{'median RT':>12}{'headline cost':>15}")
print("  " + "-" * 73)
base_med = None
for extra in (0, 50, 100, 200):
    o, t, m = [], [], []
    for _ in range(DRAWS // 10):
        y = trial_set(40.0)
        for k in range(3): y[k] += extra
        o.append(ols(y)); t.append(theil_sen(y)); m.append(st.median(y))
    med = st.mean(m)
    if base_med is None: base_med = med
    print(f"  {extra:>15} ms{st.mean(o):>12.1f}ms{st.mean(t):>12.1f}ms{med:>10.0f}ms{med-base_med:>+13.1f}ms")

print("\n  3 · DOES THE ROBUST SLOPE STILL SEE A REAL DRIFT?  (no tampering)")
print(f"  {'true drift':>18}{'OLS':>14}{'Theil-Sen':>14}{'OLS sd':>10}{'T-S sd':>10}")
print("  " + "-" * 66)
for d in (0.0, 20.0, 40.0, 80.0):
    o, t = [], []
    for _ in range(DRAWS // 10):
        y = trial_set(d); o.append(ols(y)); t.append(theil_sen(y))
    print(f"  {d:>15.0f} ms{st.mean(o):>12.1f}ms{st.mean(t):>12.1f}ms"
          f"{st.pstdev(o):>9.1f}{st.pstdev(t):>9.1f}")
