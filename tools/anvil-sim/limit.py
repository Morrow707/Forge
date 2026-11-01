"""How big does a season-long decline have to be before the chronic channel can see it?
Everything else held at the values the MLB run used."""
import math, random, statistics as st
NOISE=0.0115; BASE=0.272; FAT_SD=0.0022; DAYS=248; A_HI=75
def trial(size_in_fatSD, W, seed):
    rng=random.Random(seed); an=[]; late=[]
    for d in range(DAYS):
        dec = size_in_fatSD*FAT_SD*max(0.0,min(1.0,(d-30)/190.0))
        v = BASE - dec + rng.gauss(0,NOISE)
        if 45<=d<=A_HI: an.append(v)
        if d>DAYS-W: late.append(v)
    am,asd=st.mean(an),st.pstdev(an)
    se=asd/math.sqrt(W)
    return (am-st.mean(late))/se            # positive = slower = declined
def rate(size, W, thr=2.0, n=600):
    return 100*sum(1 for s in range(n) if trial(size,W,s)>=thr)/n
print("  Detection of a season-long decline, 30 and 60 day end window, 2 sigma rule.")
print(f"  {'decline (fatigue SD)':<24}{'30 day':>10}{'60 day':>10}{'false+ 30d':>13}")
print("  "+"-"*58)
fp30=rate(0.0,30); fp60=rate(0.0,60)
for size in (0.5,1.0,1.5,2.0,3.0,4.0,6.0):
    print(f"  {size:<24.1f}{rate(size,30):>9.0f}%{rate(size,60):>9.0f}%{fp30:>12.0f}%")
print(f"\n  with no decline at all: 30 day {fp30:.0f}%, 60 day {fp60:.0f}%  (the false positive rate)")
print("\n  For scale: the MLB run injected 0.8 to 1.6, and a typical DAY TO DAY fatigue swing is 1.0.")
print("  A decline has to be several times the size of a normal day's variation to be seen at all.")
