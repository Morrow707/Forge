"""The chronic channel, final form -- and it CORRECTS the item I had written as "nothing to do".

diag3.py found what the roster-relative z was really competing against, and it was not noise:
ROLE.  Catchers and infielders drift +0.0119 over a season, the AAA shuttle drifts -0.0036, and
an injected decline of size 1.0 moves the metric by 0.0022 -- a SEVENTH of the role spread.  A
AAA player with a real -1.51 decline reads bottom of the roster, because he plays a fifth of the
games.

"Role heterogeneity needs no tuning" was measured on the ACUTE channel and is true there: a
rolling own baseline normalises role away, z spread 1.11-1.17 across SP/RP/C/IF/OF/AAA.  A FIXED
anchor does not normalise anything, so the chronic channel inherits the whole role effect.

Scoring within role is not available -- a 40-man roster has 3 catchers and 2 utility men, far
under any cohort floor.  So role is removed by MODELLING it instead: regress each athlete's
season drift on their own accumulated work and take the residual.  One line across all 40, no
cohort split, and the predictor is the athlete's own logged load, which Forge already stores.
The statistic is then "drifted more than their own workload explains".
"""
import json, math, statistics as st
from collections import defaultdict
SEEDS=[2702,3813,4924,6035]
ANCHOR_FROM,ANCHOR_TO=20,80
MIN_COHORT=12

def fit(by, W, predictor):
    pts=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
        if len(anc)<30: continue
        last=max(r["doy"] for r in rs)
        win=[r for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        drift=st.mean([r["v"] for r in win])-st.mean(anc)
        x = (st.mean([r[predictor] for r in win]) if predictor else 0.0)
        pts.append((i,drift,x))
    if len(pts)<MIN_COHORT: return None
    if predictor:
        mx=st.mean([p[2] for p in pts]); my=st.mean([p[1] for p in pts])
        sxx=sum((p[2]-mx)**2 for p in pts)
        b=sum((p[2]-mx)*(p[1]-my) for p in pts)/sxx if sxx>0 else 0.0
        res={p[0]: p[1]-(my+b*(p[2]-mx)) for p in pts}
        # how much of the drift did the workload explain?
        ss=sum((p[1]-my)**2 for p in pts); sr=sum(v*v for v in res.values())
        r2=1-sr/ss if ss>0 else 0.0
    else:
        med=st.median([p[1] for p in pts]); res={p[0]:p[1]-med for p in pts}; r2=0.0
    v=list(res.values()); m=st.median(v)
    mad=st.median([abs(x-m) for x in v]); sd=mad/0.6745 if mad>0 else st.pstdev(v)
    return {i:(x-m)/sd for i,x in res.items()}, r2

def run(W, predictor, centile=0.90):
    agg=defaultdict(list); r2s=[]
    for sd_ in SEEDS:
        D=json.load(open(f"mlb2_{sd_}.json"))
        by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        f=fit(by,W,predictor)
        if f is None: continue
        z,r2=f; r2s.append(r2)
        for i,x in z.items(): agg[kind[i]].append(x)
    clean=sorted(agg["none"]); thr=clean[int(centile*len(clean))]
    out={k:100*sum(1 for x in agg[k] if x>=thr)/len(agg[k]) for k in ("slow","fast","none")}
    return thr,out,(st.mean(r2s) if r2s else 0.0),agg

print("  45 day end window, fixed anchor, threshold pinned at the clean group's 90th centile")
print("  so the false positive rate is 10% in every row and only DETECTION moves.\n")
print(f"  {'what the drift is scored against':<36}{'slow':>8}{'fast':>8}{'false+':>9}{'R2':>7}")
print("  "+"-"*68)
for pred,lbl in ((None,"the roster median (role and all)"),
                 ("load","the athlete's own load in the window"),
                 ("wear","the athlete's own accumulated work")):
    thr,o,r2,_=run(45,pred)
    print(f"  {lbl:<36}{o['slow']:>7.1f}%{o['fast']:>7.1f}%{o['none']:>8.1f}%{r2:>7.2f}")

print("\n  Window sweep on the winner (accumulated work), false positives held at 10%:\n")
print(f"  {'window':<10}{'slow caught':>13}{'fast caught':>13}{'R2':>8}")
print("  "+"-"*44)
for W in (21,30,45,60,90):
    thr,o,r2,_=run(W,"wear")
    print(f"  {W:<10}{o['slow']:>12.1f}%{o['fast']:>12.1f}%{r2:>8.2f}")
