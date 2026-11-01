"""Football's residual sigma (0.44 sw) is BIGGER than its raw drift spread (0.33 sw), which says
the load regression is not helping there.  Test it head to head in both worlds."""
import json, statistics as st
from statistics import NormalDist
from collections import defaultdict
NOISE=0.0115
W=dict(football=([f"fb_{s}.json" for s in (1125,2026,4419,7731)],159),
       baseball=([f"mlb2_{s}.json" for s in (2702,3813,4924,6035)],248),
       basketball=([f"nba_{s}.json" for s in range(3001,3041)],273))
def score(path, days, win, form):
    D=json.load(open(path)); by=defaultdict(list)
    for r in D["rows"]: by[r["id"]].append(r)
    kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
    af,at=int(days*0.08),int(days*0.32); pts=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if af<=r["doy"]<at]
        if len(anc)<max(15,0.5*(at-af)): continue
        last=max(r["doy"] for r in rs)
        w=[r for r in rs if r["doy"]>last-win]
        if len(w)<win*0.7: continue
        pts.append((i, st.mean([r["v"] for r in w])-st.mean(anc), st.mean([r["load"] for r in w])))
    if form=="load":
        mx=st.mean([p[2] for p in pts]); my=st.mean([p[1] for p in pts])
        sxx=sum((p[2]-mx)**2 for p in pts)
        b=sum((p[2]-mx)*(p[1]-my) for p in pts)/sxx if sxx>0 else 0.0
        res={p[0]: p[1]-(my+b*(p[2]-mx)) for p in pts}
    else:
        med=st.median([p[1] for p in pts]); res={p[0]: p[1]-med for p in pts}
    v=list(res.values()); m=st.median(v)
    mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745 if mad>0 else st.pstdev(v)
    return {i:(x-m)/sd for i,x in res.items()}, kind, sd/NOISE
z90=NormalDist().inv_cdf(0.90); z80=NormalDist().inv_cdf(0.80)
print(f"  {'world':<11}{'form':<22}{'slow':>8}{'fast':>8}{'sigma (sw)':>13}{'50% floor':>12}")
print("  "+"-"*74)
for w,(files,days) in W.items():
    for form,lbl in (("load","regress on own load"),("roster","roster median only")):
        agg=defaultdict(list); sds=[]
        for f in files:
            z,kind,sd=score(f,days,45,form); sds.append(sd)
            for i,x in z.items(): agg[kind[i]].append(x)
        clean=sorted(agg["none"]); thr=clean[int(0.90*len(clean))]
        s=100*sum(1 for x in agg["slow"] if x>=thr)/len(agg["slow"])
        fa=100*sum(1 for x in agg["fast"] if x>=thr)/len(agg["fast"])
        sd=st.mean(sds)
        print(f"  {w:<11}{lbl:<22}{s:>7.1f}%{fa:>7.1f}%{sd:>13.2f}{z90*sd:>10.2f} sw")
