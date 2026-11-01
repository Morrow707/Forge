"""The career channel: three forms, and the first two are the ones everybody builds first.

The question is narrow on purpose: can it tell an athlete who has fallen off a CLIFF from one
who is simply 34, early enough to matter, without flagging the whole back half of the roster --
and without flagging the man whose decline is slower than everybody else's?
"""
import json, statistics as st, sys
from statistics import NormalDist
from collections import defaultdict
SPORTS=("football","baseball","basketball"); SEEDS=(9001,9002,9003)
NOISE=0.0115

def load(sport):
    rows=[]
    for sd in SEEDS:
        D=json.load(open(f"career_{sport}_{sd}.json"))
        for r in D["rows"]: r["seed"]=sd; rows.append(r)
    return rows

def forms(rows):
    """Three ways to ask 'is this athlete declining'."""
    by=defaultdict(list)
    for r in rows: by[(r["seed"],r["id"])].append(r)
    for k in by: by[k].sort(key=lambda r:r["year"])
    # (a) against the athlete's own first season
    # (b) year over year, against himself
    # (c) year over year, scored against the SAME AGE cohort's year over year
    yoy=defaultdict(list)
    for k,rs in by.items():
        for i in range(1,len(rs)):
            yoy[rs[i]["age"]].append(rs[i]["season_mean"]-rs[i-1]["season_mean"])
    agenorm={}
    for age,v in yoy.items():
        if len(v)<25: continue
        m=st.median(v); mad=st.median([abs(x-m) for x in v])
        agenorm[age]=(m, mad/0.6745 if mad>0 else st.pstdev(v))
    out=[]
    for k,rs in by.items():
        rookie=rs[0]["season_mean"]
        for i,r in enumerate(rs):
            rec=dict(r)
            rec["vs_rookie"]=(r["season_mean"]-rookie)/NOISE
            rec["vs_last"]=((r["season_mean"]-rs[i-1]["season_mean"])/NOISE) if i else None
            if i and r["age"] in agenorm:
                m,sd=agenorm[r["age"]]
                rec["vs_age"]=((r["season_mean"]-rs[i-1]["season_mean"])-m)/sd
            else: rec["vs_age"]=None
            rec["traded"]=bool(i and r["team"]!=rs[i-1]["team"])
            rec["cliffYear"]=(r["cliff"] is not None and r["age"]==r["cliff"])
            out.append(rec)
    return out, agenorm

def rate(recs, field, thr, pick):
    v=[r for r in recs if r.get(field) is not None and pick(r)]
    return (100*sum(1 for r in v if r[field]>=thr)/len(v) if v else float("nan")), len(v)

print("  === 1. DOES A CAREER ANCHOR WORK?  (the athlete's own rookie season) ===")
print("  Flag anybody more than 1 day-to-day swing slower than their own first year.\n")
print(f"  {'age':<6}"+"".join(f"{s:>13}" for s in SPORTS))
print("  "+"-"*45)
R={s:forms(load(s)) for s in SPORTS}
for age in (23,26,29,32,35,37):
    cells=[]
    for s in SPORTS:
        recs,_=R[s]
        p,n = rate(recs,"vs_rookie",1.0, lambda r,a=age: r["age"]==a and not r["cliffHit"])
        cells.append(f"{p:.0f}%" if n>=20 else "  -")
    print(f"  {age:<6}"+"".join(f"{c:>13}" for c in cells))
print("\n  Those are athletes with NO cliff -- aging exactly as expected. A career anchor is a")
print("  machine for telling a 35 year old he is not 23.\n")

print("  === 2. YEAR OVER YEAR, AGAINST THE SAME-AGE COHORT ===")
print("  Threshold set on clean athletes so the false positive rate is 10% in every sport.\n")
print(f"  {'':<34}"+"".join(f"{s:>13}" for s in SPORTS))
print("  "+"-"*73)
def line(lbl,f): print(f"  {lbl:<34}"+"".join(f"{f(s):>13}" for s in SPORTS))
THR={}
for s in SPORTS:
    recs,_=R[s]
    clean=sorted(r["vs_age"] for r in recs if r.get("vs_age") is not None
                 and r["cliff"] is None and not r["ageless"])
    THR[s]=clean[int(0.90*len(clean))]
line("threshold (cohort sigmas)", lambda s: f"{THR[s]:.2f}")
line("flagged: no cliff, ordinary", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['cliff'] is None and not r['ageless'])[0]:.1f}%")
line("flagged: the year a cliff hits", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['cliffYear'])[0]:.1f}%")
line("flagged: a season after a cliff", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['cliffHit'] and not r['cliffYear'])[0]:.1f}%")
line("flagged: the ageless", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['ageless'])[0]:.1f}%")
line("flagged: the season after a trade", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['traded'])[0]:.1f}%")
line("flagged: aged 35+", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['age']>=35 and r['cliff'] is None)[0]:.1f}%")

print("\n  === 3. CAN A CAREER BE CALLED IN ONE SEASON? ===")
print("  Detection of the cliff YEAR itself, against what the same decision costs in error.\n")
print(f"  {'false positive budget':<26}"+"".join(f"{s:>15}" for s in SPORTS))
print("  "+"-"*71)
for fp in (0.02,0.05,0.10,0.20):
    cells=[]
    for s in SPORTS:
        recs,_=R[s]
        clean=sorted(r["vs_age"] for r in recs if r.get("vs_age") is not None
                     and r["cliff"] is None and not r["ageless"])
        t=clean[int((1-fp)*len(clean))]
        c=rate(recs,"vs_age",t, lambda r: r["cliffYear"])[0]
        cells.append(f"{c:.0f}% caught")
    print(f"  {int(fp*100):>3}% of clean seasons   "+"".join(f"{c:>15}" for c in cells))

print("\n  === 4. WHY IS FOOTBALL SO MUCH BETTER AT THIS? ===")
print(f"  {'':<34}"+"".join(f"{s:>13}" for s in SPORTS))
print("  "+"-"*73)
def cohort_n(s):
    recs,an=R[s]
    v=[len([r for r in recs if r["age"]==a and r.get("vs_age") is not None]) for a in an]
    return st.median(v) if v else 0
line("athletes per age cohort (median)", lambda s: f"{cohort_n(s):.0f}")
line("ages with a usable cohort", lambda s: f"{len(R[s][1])}")
def sigma(s):
    # agenorm holds sigma in RAW metric units; everything else on this page is in swings
    return st.median([sd for _,sd in R[s][1].values()])/NOISE
line("year-over-year sigma (swings)", lambda s: f"{sigma(s):.2f}")
def cliffsize(s):
    recs,_=R[s]
    v=[r["vs_last"] for r in recs if r["cliffYear"] and r.get("vs_last") is not None]
    return st.median(v)
line("the cliff itself (swings)", lambda s: f"{cliffsize(s):.2f}")
line("  as a multiple of the sigma", lambda s: f"{cliffsize(s)/sigma(s):.2f}x")

print("\n  === 5. HOW MANY SEASONS TO CALL IT? ===")
print("  A cliff caught in the year it lands, or by the end of the season after it.\n")
print(f"  {'':<34}"+"".join(f"{s:>13}" for s in SPORTS))
print("  "+"-"*73)
def within(s, k):
    recs,_=R[s]
    by=defaultdict(list)
    for r in recs: by[(r["seed"],r["id"])].append(r)
    hit=tot=0
    for rs in by.values():
        rs.sort(key=lambda r:r["year"])
        cy=[i for i,r in enumerate(rs) if r["cliffYear"]]
        if not cy: continue
        i=cy[0]; tot+=1
        if any(rs[j].get("vs_age") is not None and rs[j]["vs_age"]>=THR[s]
               for j in range(i, min(i+k, len(rs)))): hit+=1
    return 100*hit/tot if tot else float("nan")
for k,lbl in ((1,"that season"),(2,"by the end of the next"),(3,"within three")):
    line(lbl, lambda s,k=k: f"{within(s,k):.0f}%")

print("\n  === 6. DOES IT SEE A CLIFF COMING?  (the only question a GM actually has) ===")
print(f"  {'':<34}"+"".join(f"{s:>13}" for s in SPORTS))
print("  "+"-"*73)
def before(s, k):
    """flag rate in the season k years BEFORE a cliff lands"""
    recs,_=R[s]
    by=defaultdict(list)
    for r in recs: by[(r["seed"],r["id"])].append(r)
    hit=tot=0
    for rs in by.values():
        rs.sort(key=lambda r:r["year"])
        cy=[i for i,r in enumerate(rs) if r["cliffYear"]]
        if not cy: continue
        i=cy[0]-k
        if i<1 or i>=len(rs) or rs[i].get("vs_age") is None: continue
        tot+=1
        if rs[i]["vs_age"]>=THR[s]: hit+=1
    return (100*hit/tot if tot else float("nan")), tot
for k in (3,2,1):
    line(f"the season {k} year(s) before", lambda s,k=k: f"{before(s,k)[0]:.1f}%")
line("the season it lands", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['cliffYear'])[0]:.1f}%")
line("(base rate, ordinary season)", lambda s: f"{rate(R[s][0],'vs_age',THR[s], lambda r: r['cliff'] is None and not r['ageless'])[0]:.1f}%")

print("\n  === 7. AND THE LATE BLOOMER: does it punish getting BETTER? ===")
def improving(s):
    recs,_=R[s]
    v=[r for r in recs if r.get("vs_age") is not None and r["cliff"] is None
       and r.get("vs_last") is not None and r["vs_last"] < -0.3]     # got faster year on year
    return (100*sum(1 for r in v if r["vs_age"]>=THR[s])/len(v) if v else float("nan")), len(v)
line("flagged after a season of gains", lambda s: f"{improving(s)[0]:.1f}%")
line("  (n)", lambda s: f"{improving(s)[1]}")
