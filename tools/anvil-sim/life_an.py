"""The lifetime cohort, read against the underage plan."""
import json, statistics as st
from statistics import NormalDist
from collections import defaultdict
NOISE=0.0115; SEEDS=(5001,5002,5003,5004)
rows=[]; ath={}
for sd in SEEDS:
    D=json.load(open(f"life_{sd}.json"))
    for r in D["rows"]: r["seed"]=sd; rows.append(r)
    for a in D["athletes"]: ath[(sd,a["id"])]=a
by=defaultdict(list)
for r in rows: by[(r["seed"],r["id"])].append(r)
for k in by: by[k].sort(key=lambda r:r["age"])
# year-over-year, scored against the SAME AGE cohort (here the whole cohort, same birth year)
yoy=defaultdict(list)
for rs in by.values():
    for i in range(1,len(rs)): yoy[rs[i]["age"]].append(rs[i]["season"]-rs[i-1]["season"])
norm={}
for age,v in yoy.items():
    m=st.median(v); mad=st.median([abs(x-m) for x in v])
    norm[age]=(m, (mad/0.6745 if mad>0 else st.pstdev(v)))
recs=[]
for rs in by.values():
    for i,r in enumerate(rs):
        if i==0: continue
        m,sd=norm[r["age"]]
        recs.append(dict(**r, z=((r["season"]-rs[i-1]["season"])-m)/sd,
                         cliffYear=(r["cliff"] is not None and r["age"]==r["cliff"]),
                         cliffHit=(r["cliff"] is not None and r["age"]>=r["cliff"])))
clean=sorted(r["z"] for r in recs if r["cliff"] is None and not r["ageless"])
THR=clean[int(0.90*len(clean))]

print(f"  75 athletes x 4 cohorts = 300 careers, ages 13-45, {len(recs)} scoreable athlete-years.")
print(f"  Threshold {THR:.2f} cohort sigmas (10% false positive on clean adults).\n")
print(f"  {'age':<5}{'n':>5}{'cohort move':>14}{'sigma':>8}{'clean flagged':>15}{'what it means':>34}")
print("  "+"-"*81)
for age in sorted(norm):
    v=[r for r in recs if r["age"]==age]
    cl=[r for r in v if r["cliff"] is None and not r["ageless"]]
    if len(v)<30: continue
    m,sd=norm[age]
    fl=100*sum(1 for r in cl if r["z"]>=THR)/max(len(cl),1)
    note=""
    if age<18: note="MINOR -- gate closed"
    elif age<=20: note="still growing"
    elif 24<=age<=28: note="the peak transition"
    print(f"  {age:<5}{len(v):>5}{m/NOISE:>12.2f} sw{sd/NOISE:>8.2f}{fl:>14.1f}%{note:>34}")

print("\n  === THE AGELESS: when does the record first show them? ===")
print("  Cumulative level relative to the cohort median, by age.\n")
bands=defaultdict(lambda: defaultdict(list))
for r in rows:
    bands[r["age"]]["all"].append(r["level"])
for r in rows:
    bands[r["age"]]["ageless" if r["ageless"] else "ordinary"].append(r["level"])
print(f"  {'age':<6}{'ordinary':>11}{'ageless':>11}{'gap':>9}{'gap / cohort sd':>18}")
print("  "+"-"*56)
first=None
for age in range(16,42,2):
    o=bands[age]["ordinary"]; g=bands[age]["ageless"]
    if len(g)<4: continue
    sd=st.pstdev(bands[age]["all"])
    gap=st.mean(g)-st.mean(o)
    d=gap/sd if sd>0 else 0
    if first is None and d>=1.0: first=age
    print(f"  {age:<6}{st.mean(o):>11.3f}{st.mean(g):>11.3f}{gap:>9.3f}{d:>17.2f}")
print(f"\n  First age at which the ageless stand a full cohort SD clear: {first}")

print("\n  === WHAT THE MINORS GATE COSTS, AND WHAT IT PREVENTS ===")
minors=[r for r in recs if r["age"]<18]
adults=[r for r in recs if r["age"]>=24 and r["age"]<=35]
def split(v):
    f=[r for r in v if r["z"]>=THR]
    real=sum(1 for r in f if r["cliffHit"])
    return len(f), real, len(f)-real
mf,mr,mw=split(minors); af,ar,aw=split(adults)
print(f"  Under 18:  {mf} readings would have been flagged -- {mr} on an athlete with a real")
print(f"             cliff, {mw} on one WITHOUT. {100*mw/max(mf,1):.0f}% of them would have been wrong.")
print(f"  24 to 35:  {af} flagged -- {ar} real, {aw} not. {100*aw/max(af,1):.0f}% wrong.")
print(f"\n  Cohort sigma at 14 is {norm[14][1]/NOISE:.2f} swings; at 25 it is {norm[25][1]/NOISE:.2f}.")
print(f"  The instrument is {norm[14][1]/norm[25][1]:.1f}x COARSER on a fourteen year old, which is a")
print("  measurement reason for the gate and not only an ethical one.")

print("\n  === THE RECORD ITSELF ===")
tot=len(set(by.keys()))
full=sum(1 for rs in by.values() if len(rs)==33)
stages=defaultdict(int)
for r in rows: stages[r["stage"]]+=1
rec=stages["recreational"]
print(f"  {full} of {tot} careers have all 33 years ({100*full/tot:.0f}%).")
print(f"  {rec} of {len(rows)} athlete-years ({100*rec/len(rows):.0f}%) are AFTER the competitive")
print("  career ended. The long-term user of a 32 year record is a recreational adult.")
