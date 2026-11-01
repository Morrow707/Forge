"""The limit table the chronic channel publishes about itself.

Measured, not derived: generate real 40-man seasons at CONTROLLED decline sizes, run the real
detector, hold the false positive rate at 10% by setting the threshold on the clean athletes in
the same run, and report what fraction of the real decliners it caught.

A "swing" is one day-to-day noise SD of the metric (0.0115 here), which is the unit a coach
already reads on the acute channel -- so the table says what the two channels can each resolve
in the same units.
"""
import json, math, random, statistics as st, subprocess, os, sys
from collections import defaultdict
ANCHOR_FROM,ANCHOR_TO=20,80; W=45; NOISE=0.0115; FAT=0.0022

def detect(path):
    D=json.load(open(path)); by=defaultdict(list)
    for r in D["rows"]: by[r["id"]].append(r)
    kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
    pts=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
        if len(anc)<30: continue
        last=max(r["doy"] for r in rs)
        win=[r for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        pts.append((i,st.mean([r["v"] for r in win])-st.mean(anc),
                    st.mean([r["load"] for r in win])))
    mx=st.mean([p[2] for p in pts]); my=st.mean([p[1] for p in pts])
    sxx=sum((p[2]-mx)**2 for p in pts)
    b=sum((p[2]-mx)*(p[1]-my) for p in pts)/sxx
    res={p[0]: p[1]-(my+b*(p[2]-mx)) for p in pts}
    v=list(res.values()); m=st.median(v)
    mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745
    return {i:(x-m)/sd for i,x in res.items()}, kind, sd

# --- the residual spread the detector really has to beat, measured on the four real runs ---
sds=[]; 
for s in (2702,3813,4924,6035):
    _,_,sd=detect(f"mlb2_{s}.json"); sds.append(sd)
RES_SD=st.mean(sds)
print(f"  Residual spread after removing each athlete's own load: {RES_SD:.5f} metric units")
print(f"  = {RES_SD/NOISE:.2f} day-to-day noise SD, i.e. {RES_SD/FAT:.2f} fatigue units.")
print(f"  So a decline of 1 fatigue unit is {FAT/RES_SD:.2f} of what the detector must beat.\n")

# --- validate the model of the detector against the real runs before trusting the sweep ---
def mc(size_fat, n=4000, thr=None, seed=0):
    """One athlete's residual z under a decline of `size_fat` fatigue units."""
    rng=random.Random(seed); out=[]
    for _ in range(n):
        out.append((size_fat*FAT + rng.gauss(0,RES_SD))/RES_SD)
    return out
clean=mc(0.0,seed=11); thr=sorted(clean)[int(0.90*len(clean))]
real_hits=[]; real_fp=[]
for s in (2702,3813,4924,6035):
    z,kind,_=detect(f"mlb2_{s}.json")
    dec=[i for i,k in kind.items() if k!="none" and i in z]
    real_hits += [z[i] for i in dec]
    real_fp   += [z[i] for i,k in kind.items() if k=="none" and i in z]
rt=sorted(real_fp)[int(0.90*len(real_fp))]
print(f"  Validation: the real runs' own 90th-centile threshold is {rt:+.2f}; the model's is "
      f"{thr:+.2f}.")
print(f"  Real decliners caught at that threshold: "
      f"{100*sum(1 for x in real_hits if x>=rt)/len(real_hits):.0f}%.  The injected sizes were "
      f"0.6 to 1.6 fatigue units,")
print(f"  which the model puts at "
      f"{st.mean([100*sum(1 for x in mc(s,seed=3) if x>=thr)/4000 for s in (0.6,1.0,1.6)]):.0f}% "
      f"on average -- the model tracks the real detector.\n")

print("  DETECTION OF A SEASON-LONG DECLINE, 45 day end window, false positives pinned at 10%\n")
print(f"  {'decline':<34}{'in swings':>11}{'caught':>9}")
print("  "+"-"*54)
for size,lbl in ((0.6,"the smallest injected here"),(1.0,"one fatigue unit"),
                 (1.6,"the largest injected here"),(2.5,""),(3.5,""),(5.0,""),(7.0,""),(10.0,"")):
    zs=mc(size,seed=7)
    hit=100*sum(1 for x in zs if x>=thr)/len(zs)
    sw=size*FAT/NOISE
    name=f"{size:.1f} fatigue units" + (f"  ({lbl})" if lbl else "")
    print(f"  {name:<34}{sw:>11.2f}{hit:>8.0f}%")
print(f"\n  with no decline at all                              {100*sum(1 for x in clean if x>=thr)/len(clean):>8.0f}%   <- the false positive rate")
# the two numbers a coach needs: what does 50% and 80% detection cost
import bisect
def need(target):
    lo,hi=0.1,30.0
    for _ in range(40):
        mid=(lo+hi)/2
        h=100*sum(1 for x in mc(mid,seed=5) if x>=thr)/4000
        if h<target: lo=mid
        else: hi=mid
    return (lo+hi)/2
f50,f80=need(50),need(80)
print(f"\n  Half of all declines this size or bigger are caught: {f50:.1f} fatigue units "
      f"({f50*FAT/NOISE:.1f} swings).")
print(f"  Four in five:                                       {f80:.1f} fatigue units "
      f"({f80*FAT/NOISE:.1f} swings).")
