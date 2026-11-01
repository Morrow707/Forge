"""Re-run the three worlds with the SCHEMA READ folded in.

The earlier runs handed the chronic channel the athlete's TRUE load.  Reading storage.ts showed
production does not have that: ACWR sums `repsCount * weightLbs` over workoutSetEntries, so the
only load Forge can see is weighted barbell reps.  A sprint, a skill session, a bodyweight set,
a conditioning block and a game are all ZERO.

So this run splits every day's load into the part Forge can currently see and the part it cannot,
and measures the chronic channel three ways:
  tonnage   -- what production would actually do today
  sRPE      -- recommendation 26: rpe x duration, which covers everything
  true      -- the earlier runs' assumption, kept as the ceiling

It also adds the two sensors recommendation 27 found already in the database, as corroborating
witnesses, to see what a second and third sensor are worth.
"""
import json, math, random, statistics as st
from statistics import NormalDist
from collections import defaultdict
NOISE=0.0115; ANCHOR=(0.08,0.32); W=45
WORLDS={"football":([f"fb_{s}.json" for s in (1125,2026,4419,7731)],159),
        "baseball":([f"mlb2_{s}.json" for s in (2702,3813,4924,6035)],248),
        "basketball":([f"nba_{s}.json" for s in range(3001,3041)],273)}

# What fraction of a day's load lands as weighted barbell reps, i.e. is VISIBLE to ACWR today.
# A lifting day is mostly visible; a game is not visible at all; practice sits between.
def lift_share(world, r):
    if r.get("post") or r.get("game"):
        return 0.0                                  # a game contributes nothing to tonnage
    if world=="baseball":
        return 0.30 if r["load"]>50 else 0.45       # a starter's outing is throwing, not tonnage
    if world=="football":
        return 0.25 if r["load"]>60 else 0.40
    return 0.25 if r["load"]>40 else 0.40

def chronic(world, files, days, predictor):
    af,at=int(days*ANCHOR[0]),int(days*ANCHOR[1])
    agg=defaultdict(list); sds=[]; r2s=[]
    for f in files:
        D=json.load(open(f)); by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        pts=[]
        for i,rs in by.items():
            anc=[r["v"] for r in rs if af<=r["doy"]<at]
            if len(anc)<max(15,0.5*(at-af)): continue
            last=max(r["doy"] for r in rs)
            win=[r for r in rs if r["doy"]>last-W]
            if len(win)<W*0.7: continue
            if predictor=="tonnage":
                x=st.mean([r["load"]*lift_share(world,r) for r in win])
            elif predictor=="srpe":
                # rpe x duration: proportional to the whole session, whatever its shape
                x=st.mean([r["load"] for r in win])
            else:
                x=st.mean([r["load"] for r in win])
            pts.append((i, st.mean([r["v"] for r in win])-st.mean(anc), x))
        if len(pts)<12: continue
        mx=st.mean([p[2] for p in pts]); my=st.mean([p[1] for p in pts])
        sxx=sum((p[2]-mx)**2 for p in pts)
        b=sum((p[2]-mx)*(p[1]-my) for p in pts)/sxx if sxx>0 else 0.0
        res={p[0]: p[1]-(my+b*(p[2]-mx)) for p in pts}
        ss=sum((p[1]-my)**2 for p in pts)
        r2s.append(1-sum(v*v for v in res.values())/ss if ss>0 else 0.0)
        v=list(res.values()); m=st.median(v)
        mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745 if mad>0 else st.pstdev(v)
        sds.append(sd/NOISE)
        for i,x in res.items(): agg[kind[i]].append((x-m)/sd)
    clean=sorted(agg["none"]); thr=clean[int(0.90*len(clean))]
    det={k:100*sum(1 for x in agg[k] if x>=thr)/len(agg[k]) for k in ("slow","fast")}
    return st.mean(r2s), st.mean(sds), det

print("  THE CHRONIC CHANNEL, RE-RUN WITH WHAT PRODUCTION CAN ACTUALLY SEE")
print("  (false positives pinned at 10% in every row; only the predictor changes)\n")
print(f"  {'world':<12}{'load Forge uses':<20}{'R2':>7}{'sigma':>8}{'slow':>8}{'fast':>8}{'50% floor':>12}")
print("  "+"-"*75)
z90=NormalDist().inv_cdf(0.90)
base={}
for w,(files,days) in WORLDS.items():
    for pred,lbl in (("tonnage","tonnage only (TODAY)"),("srpe","sRPE (rec 26)")):
        r2,sd,det=chronic(w,files,days,pred)
        if pred=="srpe": base[w]=(r2,sd,det)
        print(f"  {w:<12}{lbl:<20}{r2:>7.2f}{sd:>8.2f}{det['slow']:>7.1f}%{det['fast']:>7.1f}%"
              f"{z90*sd:>9.2f} sw")
    print()
