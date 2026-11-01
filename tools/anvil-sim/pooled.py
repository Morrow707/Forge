"""An 18 man roster is barely over the cohort floor.  Does borrowing other teams fix it?

Forge is a PLATFORM, so a chronic channel need not be scored inside one roster -- the strength
percentile already pools across the whole app behind NORM_MIN_COHORT.  The question is whether
pooling actually helps, because the chronic channel's regression is on the athlete's OWN load,
and a borrowed cohort brings other teams' schedules with it.
"""
import json, statistics as st
from statistics import NormalDist
from collections import defaultdict
NOISE=0.0115; AFRAC,ATFRAC=0.08,0.32; W=45
def pts_from(files, days):
    out=[]
    for f in files:
        D=json.load(open(f)); by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        af,at=int(days*AFRAC),int(days*ATFRAC)
        for i,rs in by.items():
            anc=[r["v"] for r in rs if af<=r["doy"]<at]
            if len(anc)<max(15,0.5*(at-af)): continue
            last=max(r["doy"] for r in rs)
            win=[r for r in rs if r["doy"]>last-W]
            if len(win)<W*0.7: continue
            out.append((f,i,kind[i], st.mean([r["v"] for r in win])-st.mean(anc),
                        st.mean([r["load"] for r in win])))
    return out
def score(group):
    mx=st.mean([p[4] for p in group]); my=st.mean([p[3] for p in group])
    sxx=sum((p[4]-mx)**2 for p in group)
    b=sum((p[4]-mx)*(p[3]-my) for p in group)/sxx if sxx>0 else 0.0
    res=[(p[2], p[3]-(my+b*(p[4]-mx))) for p in group]
    v=[x for _,x in res]; m=st.median(v)
    mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745 if mad>0 else st.pstdev(v)
    return [(k,(x-m)/sd) for k,x in res], sd/NOISE
FILES=[f"nba_{s}.json" for s in range(3001,3041)]
print("  Basketball, 18 man rosters, 40 seasons.\n")
print(f"  {'cohort the athlete is scored in':<36}{'sigma':>9}{'slow':>9}{'fast':>9}{'50% floor':>12}")
print("  "+"-"*75)
for k,lbl in ((1,"their own roster (18 athletes)"),(2,"two teams pooled (36)"),
              (4,"four teams pooled (72)"),(10,"ten teams pooled (180)"),
              (40,"the whole platform (720)")):
    allz=defaultdict(list); sds=[]
    for s in range(0,len(FILES),k):
        grp=pts_from(FILES[s:s+k], 273)
        if len(grp)<12: continue
        z,sd=score(grp); sds.append(sd)
        for kind,x in z: allz[kind].append(x)
    clean=sorted(allz["none"]); thr=clean[int(0.90*len(clean))]
    sl=100*sum(1 for x in allz["slow"] if x>=thr)/len(allz["slow"])
    fa=100*sum(1 for x in allz["fast"] if x>=thr)/len(allz["fast"])
    sd=st.mean(sds); z90=NormalDist().inv_cdf(0.90)
    print(f"  {lbl:<36}{sd:>9.2f}{sl:>8.1f}%{fa:>8.1f}%{z90*sd:>9.2f} sw")
print("\n  Every row holds the false positive rate at 10% by construction, so only the floor")
print("  and the detection move.  Pooling borrows other teams' SCHEDULES as well as their")
print("  athletes, which is the cost to watch for.")

print("\n  Pooling does not move sigma -- sigma is a property of the population, not a sample")
print("  size. What 18 athletes buys you is a noisy ESTIMATE of it, and of the threshold that")
print("  comes off it. In production you have ONE season of ONE team, so that matters:\n")
print(f"  {'threshold estimated from':<36}{'mean':>9}{'spread':>10}{'worst':>9}{'best':>8}")
print("  "+"-"*72)
for k,lbl in ((1,"one team, one season (18)"),(2,"two teams (36)"),(4,"four teams (72)"),
              (10,"ten teams (180)")):
    ths=[]
    for s in range(0,len(FILES),k):
        grp=pts_from(FILES[s:s+k],273)
        if len(grp)<12: continue
        z,_=score(grp)
        clean=sorted(x for kind,x in z if kind=="none")
        if len(clean)<8: continue
        ths.append(clean[int(0.90*len(clean))])
    print(f"  {lbl:<36}{st.mean(ths):>9.2f}{st.pstdev(ths):>10.2f}{max(ths):>9.2f}{min(ths):>8.2f}")
print("\n  A threshold that swings between those extremes is a channel whose false positive rate")
print("  is not the number you set. THAT is what pooling fixes, and it is worth doing for that")
print("  reason alone -- not because it makes the instrument finer, which it does not.")
