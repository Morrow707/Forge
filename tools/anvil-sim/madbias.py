"""The finite-sample bias of MAD/0.6745 as a sigma estimate. Pure arithmetic: draw n standard
normals, estimate sigma the way the Anvil's baseline does, and see what the estimate averages."""
import random, statistics as st
C = 0.6745
def est(n, rng):
    x = [rng.gauss(0, 1) for _ in range(n)]
    m = st.median(x)
    return st.median([abs(v - m) for v in x]) / C
rng = random.Random(20261106)
print(f"{'n':>4}  {'mean est. sigma':>15}  {'correction':>10}  {'reps':>8}")
for n in (10, 14, 20, 25, 30, 60, 120):
    reps = 400_000
    e = [est(n, rng) for _ in range(reps)]
    mu = st.fmean(e)
    print(f"{n:>4}  {mu:>15.4f}  {1/mu:>10.4f}  {reps:>8}")
