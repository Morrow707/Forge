"""Forge's athletes are mostly teenagers.  Every career number so far starts at 21.

A 15 year old is PRE-PEAK: their year-over-year change is growth, and the aging curve says
ability rises to about 26.  So the question is not academic -- it is whether a career channel
pointed at a high school athlete says anything, or says something harmful.
"""
import subprocess, json, statistics as st, sys
from collections import defaultdict
NOISE=0.0115
# regenerate three leagues with a HIGH SCHOOL entry age
src=open("career.py").read()
src=src.replace('"football":   dict(teams=6, roster=125, days=159, anchor=(13, 51), window=45,\n                       entry=(18, 23), peak=26.0, replace=0.70),',
                '"football":   dict(teams=6, roster=125, days=159, anchor=(13, 51), window=45,\n                       entry=(14, 17), peak=26.0, replace=0.70),')
src=src.replace('open(f"career_{SPORT}_{SEED}.json", "w")','open(f"youth_{SPORT}_{SEED}.json", "w")')
# a high schooler is not cut from the league at 17 for being 17
src=src.replace('ranked = sorted(pool, key=lambda a: a["lastLevel"] + (0.012 * max(0, 30 - (year - a["born"]))))',
                'ranked = sorted(pool, key=lambda a: a["lastLevel"] + (0.012 * max(0, 30 - (year - a["born"]))) + (0.25 if (year - a["born"]) < 19 else 0.0))')
open("_youth_gen.py","w").write(src)
for sd in (9001,9002,9003):
    subprocess.run([sys.executable,"_youth_gen.py","football",str(sd),"16"],check=True,capture_output=True)
rows=[]
for sd in (9001,9002,9003):
    D=json.load(open(f"youth_football_{sd}.json"))
    for r in D["rows"]: r["seed"]=sd; rows.append(r)
by=defaultdict(list)
for r in rows: by[(r["seed"],r["id"])].append(r)
for k in by: by[k].sort(key=lambda r:r["year"])
yoy=defaultdict(list)
for rs in by.values():
    for i in range(1,len(rs)): yoy[rs[i]["age"]].append(rs[i]["season_mean"]-rs[i-1]["season_mean"])
norm={}
for age,v in yoy.items():
    if len(v)<25: continue
    m=st.median(v); mad=st.median([abs(x-m) for x in v]); norm[age]=(m, (mad/0.6745 if mad>0 else st.pstdev(v)))
recs=[]
for rs in by.values():
    for i,r in enumerate(rs):
        if i==0 or r["age"] not in norm: continue
        m,sd=norm[r["age"]]
        recs.append(dict(age=r["age"], z=((r["season_mean"]-rs[i-1]["season_mean"])-m)/sd,
                         raw=(r["season_mean"]-rs[i-1]["season_mean"])/NOISE,
                         cliff=r["cliff"] is not None, ageless=r["ageless"]))
clean=sorted(r["z"] for r in recs if not r["cliff"] and not r["ageless"])
THR=clean[int(0.90*len(clean))]
print(f"  Football, entry age 14-17, 16 seasons, {len(recs)} athlete-seasons with a cohort.")
print(f"  Threshold {THR:.2f} cohort sigmas (10% false positive on clean athletes).\n")
print(f"  {'age':<6}{'n':>7}{'median change':>16}{'cohort sigma':>15}{'flagged':>10}")
print("  "+"-"*54)
for age in sorted(norm):
    v=[r for r in recs if r["age"]==age and not r["cliff"]]
    if len(v)<25: continue
    m,sd=norm[age]
    print(f"  {age:<6}{len(v):>7}{m/NOISE:>14.2f} sw{sd/NOISE:>14.2f}"
          f"{100*sum(1 for r in v if r['z']>=THR)/len(v):>9.1f}%")
print("\n  'median change' is the whole cohort's year-on-year move in day-to-day swings.")
print("  Negative = the cohort got FASTER that year.  A cohort that is still growing has a")
print("  negative median at every age, and the sigma is what the channel has to beat.")
