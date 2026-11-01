"""ONE detector, three worlds.  125 men over 17 games, 40 men over 184, 18 men over 112.

Nothing sport-specific is in this file: the taus live in tau.py, and everything here -- the
anchor, the window, the regression on the athlete's own load, the robust sigma, the threshold
pinned to the clean group's 90th centile -- is the same code running twice.
"""
import json, statistics as st, sys
from statistics import NormalDist
from collections import defaultdict
NOISE=0.0115; FAT=0.0022

WORLDS={
 "baseball": dict(files=[f"mlb2_{s}.json" for s in (2702,3813,4924,6035)], days=248, roster=40),
 "football": dict(files=[f"fb_{s}.json"   for s in (1125,2026,4419,7731)], days=159, roster=125),
 "basketball": dict(files=[f"nba_{s}.json" for s in range(3001,3041)],    days=273, roster=18),
}
ORDER=("football","baseball","basketball")
# the anchor is the same FRACTION of each season: camp through the first weeks
FRAC_FROM, FRAC_TO = 0.08, 0.32

_CACHE={}
def load(path):
    """Parsed once.  The window sweep asks for the same world six times and the basketball
    run is forty files; re-reading them is the whole runtime."""
    if path not in _CACHE:
        D=json.load(open(path)); by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        _CACHE[path]=(D,by,kind)
    return _CACHE[path]

def acute(by, warm=10, N=20):
    """unchanged: a rolling own baseline over the last N captures, flag at z>=2"""
    out={}
    for i,rs in by.items():
        fl=tot=0
        for k,r in enumerate(rs):
            prev=rs[max(0,k-N):k]
            if len(prev)<warm: continue
            v=[h["v"] for h in prev]; m,s=st.mean(v),st.pstdev(v)
            if s<=0: continue
            tot+=1
            if (r["v"]-m)/s>=2.0: fl+=1
        if tot: out[i]=(100*fl/tot, tot)
    return out

def chronic(by, days, W):
    """season drift against a fixed anchor, with the athlete's own load regressed out"""
    af,at=int(days*FRAC_FROM), int(days*FRAC_TO)
    pts=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if af<=r["doy"]<at]
        if len(anc)<max(15,0.5*(at-af)): continue
        last=max(r["doy"] for r in rs)
        win=[r for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        pts.append((i, st.mean([r["v"] for r in win])-st.mean(anc),
                       st.mean([r["load"] for r in win])))
    if len(pts)<12: return {},0.0,0
    mx=st.mean([p[2] for p in pts]); my=st.mean([p[1] for p in pts])
    sxx=sum((p[2]-mx)**2 for p in pts)
    b=sum((p[2]-mx)*(p[1]-my) for p in pts)/sxx if sxx>0 else 0.0
    res={p[0]: p[1]-(my+b*(p[2]-mx)) for p in pts}
    ss=sum((p[1]-my)**2 for p in pts); r2=1-sum(v*v for v in res.values())/ss if ss>0 else 0.0
    v=list(res.values()); m=st.median(v)
    mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745 if mad>0 else st.pstdev(v)
    return {i:(x-m)/sd for i,x in res.items()}, r2, sd

_ACUTE={}
def run(world, W):
    cfg=WORLDS[world]
    az=defaultdict(list); cz=defaultdict(list); r2s=[]; sds=[]
    cov=[0,0]
    for f in cfg["files"]:
        D,by,kind=load(f)
        if f not in _ACUTE:
            _ACUTE[f]=acute(by)
        a=_ACUTE[f]
        for i,(pct,_) in a.items(): az[kind[i]].append(pct)
        z,r2,sd=chronic(by,cfg["days"],W)
        r2s.append(r2); sds.append(sd)
        cov[0]+=len(z); cov[1]+=len(by)
        for i,x in z.items(): cz[kind[i]].append(x)
    clean=sorted(cz["none"]); thr=clean[int(0.90*len(clean))] if clean else 0
    det={k:(100*sum(1 for x in cz[k] if x>=thr)/len(cz[k]) if cz[k] else 0) for k in ("slow","fast","none")}
    return dict(acute={k:(st.mean(v) if v else 0) for k in ("slow","fast","none") for v in [az[k]]},
                chronic=det, r2=st.mean(r2s), sd=st.mean(sds)/NOISE,
                cov=100*cov[0]/cov[1], thr=thr)

print("  THREE WORLDS, ONE DETECTOR\n")
print(f"  {'':<34}{'football':>14}{'baseball':>14}{'basketball':>14}")
print(f"  {'':<34}{'125 / 17 games':>14}{'40 / 184':>14}{'18 / 112':>14}")
print("  "+"-"*76)
R={w:run(w,45) for w in ORDER}
for w in ORDER:
    D,by,_=load(WORLDS[w]["files"][0])
    R[w]["caps"]=st.median([len(v) for v in by.values()])
    R[w]["gaps"]=100*sum(1 for v in by.values() if len(v)<WORLDS[w]["days"]*0.85)/len(by)

def line(lbl, f):
    print(f"  {lbl:<34}"+"".join(f"{f(w):>14}" for w in ORDER))
line("season length (days)", lambda w: str(WORLDS[w]["days"]))
line("roster", lambda w: str(WORLDS[w]["roster"]))
line("captures per athlete (median)", lambda w: f"{R[w]['caps']:.0f}")
line("athletes with a broken series", lambda w: f"{R[w]['gaps']:.0f}%")
print()
line("ACUTE  flagged, clean athletes", lambda w: f"{R[w]['acute']['none']:.2f}%")
line("ACUTE  flagged, fast decliners", lambda w: f"{R[w]['acute']['fast']:.2f}%")
line("ACUTE  flagged, slow decliners", lambda w: f"{R[w]['acute']['slow']:.2f}%")
print()
line("CHRONIC athletes scoreable", lambda w: f"{R[w]['cov']:.0f}%")
line("CHRONIC load explains (R2)", lambda w: f"{R[w]['r2']:.2f}")
line("CHRONIC residual sigma (swings)", lambda w: f"{R[w]['sd']:.2f}")
line("CHRONIC caught, fast  (10% FP)", lambda w: f"{R[w]['chronic']['fast']:.1f}%")
line("CHRONIC caught, slow  (10% FP)", lambda w: f"{R[w]['chronic']['slow']:.1f}%")
z=NormalDist().inv_cdf(0.90)
line("CHRONIC floor, 50% caught", lambda w: f"{z*R[w]['sd']:.2f} sw")
line("CHRONIC floor, 80% caught", lambda w: f"{(z+NormalDist().inv_cdf(0.80))*R[w]['sd']:.2f} sw")

print("\n  Window swept in all three (slow decliners caught, 10% false positives):\n")
print(f"  {'window (days)':<16}"+"".join(f"{w:>13}" for w in ORDER))
print("  "+"-"*55)
for W in (14,21,30,45,60,90):
    out=[]
    for w in ORDER:
        out.append("n/a" if W>WORLDS[w]["days"]*0.45 else f"{run(w,W)['chronic']['slow']:.1f}%")
    print(f"  {W:<16}"+"".join(f"{x:>13}" for x in out))
