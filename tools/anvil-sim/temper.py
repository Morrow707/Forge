"""How noisy is each Temper metric at the trial count Temper actually runs?

The protocol is 40 trials with a go:leave:hold mix of 7:5:2, so GO trials are half of them --
about 20 reaction times per check. The headline is the mean of the slowest 10%, and
`Math.max(2, round(20*0.1))` is 2, so the number an athlete sees every morning is
THE MEAN OF THE TWO SLOWEST OF TWENTY.

Reaction times are ex-Gaussian, not normal: a Gaussian core plus an exponential tail. That tail
is where fatigue shows up, which is why the tail statistic is the right CHOICE -- and also why
it is the most sample-hungry thing you could pick.
"""
import random, statistics as st, math

MU, SIG, TAU = 265.0, 28.0, 55.0          # a typical healthy adolescent simple-RT draw
def draw(rng, shift=0.0):
    return MU + shift + rng.gauss(0, SIG) + rng.expovariate(1.0/TAU)

def sample(n, rng, shift=0.0):
    return [draw(rng, shift) for _ in range(n)]

def tail10(v):
    k=max(2, round(len(v)*0.10))
    return st.mean(sorted(v)[-k:])
def median(v): return st.median(v)
def lapses(v, thr=355.0): return 100.0*sum(1 for x in v if x>thr)/len(v)
def fade(v):
    t=max(2, len(v)//3)
    return st.mean(v[-t:]) - st.mean(v[:t])

METRICS=[("tail 10% (the headline)",tail10),("median (what it replaced)",median),
         ("lapse rate",lapses),("fade: late third - early third",fade)]

print("  NOISE OF EACH METRIC, by how many GO trials the check collects.")
print("  'noise' = SD of the metric across repeated healthy checks, in ms (lapse rate in points).\n")
print(f"  {'go trials':<12}" + "".join(f"{lbl.split(' (')[0][:22]:>24}" for lbl,_ in METRICS))
print("  "+"-"*108)
rng=random.Random(7)
for n in (20, 30, 40, 60, 80):
    cells=[]
    for lbl,f in METRICS:
        vals=[f(sample(n,rng)) for _ in range(4000)]
        cells.append(st.pstdev(vals))
    print(f"  {n:<12}" + "".join(f"{c:>23.1f}" for c in cells))

print("\n  And what each metric can RESOLVE: the shift in true RT it detects half the time,")
print("  at a 10% false positive rate, from ONE check against a 20-check baseline.\n")
print(f"  {'go trials':<12}" + "".join(f"{lbl.split(' (')[0][:22]:>24}" for lbl,_ in METRICS))
print("  "+"-"*108)
for n in (20, 40, 60):
    cells=[]
    for lbl,f in METRICS:
        base=[f(sample(n,rng)) for _ in range(20)]
        bm, bs = st.mean(base), st.pstdev([f(sample(n,rng)) for _ in range(2000)])
        # z>=1.28 on one check: the shift needed so the metric moves 1.28 SD
        lo,hi=0.0,300.0
        for _ in range(40):
            mid=(lo+hi)/2
            shifted=[f(sample(n,rng,mid)) for _ in range(600)]
            hit=100*sum(1 for x in shifted if (x-bm)/bs>=1.28)/600
            if hit<50: lo=mid
            else: hi=mid
        cells.append((lo+hi)/2)
    print(f"  {n:<12}" + "".join(f"{c:>21.0f} ms" for c in cells))
print("\n  For scale: a night of total sleep deprivation moves simple RT by roughly 10-40 ms,")
print("  and Highmark's shipped reaction subtest still had a 33 ms PRACTICE drift at sitting three.")
