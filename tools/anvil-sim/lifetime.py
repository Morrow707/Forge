"""75 athletes -- 25 football, 25 baseball, 25 basketball -- followed from 13 to 45.

A single BIRTH COHORT, not a league: everyone is the same age every year, which is exactly the
record Scott described and is the cleanest possible test of the age-cohort channel, since the
cohort needs no matching.

What it is really testing is the UNDERAGE PLAN: a record that starts at 13 and a reading that
does not. Plus the thing no league run could show -- what Forge measures on a 34 year old who
stopped competing at 24 and still trains three times a week.
"""
import math, random, statistics as st, json, sys
from statistics import NormalDist
from collections import defaultdict
from tau import tunables
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 5001
random.seed(SEED)
NOISE=0.0115; START_AGE=13; END_AGE=45
SPORTS=("football","baseball","basketball")
PEAK={"football":26.0,"baseball":27.5,"basketball":27.0}
# in-season days and a rough daily load for each stage of a life in sport
STAGE={ "youth":        (150, 34),    # 13-17: school sport, multi-sport, light
        "hs_college":   (200, 62),    # 18-22
        "pro":          (250, 78),    # 23+ if they make it
        "semi":         (180, 50),    # 23+ if they do not: club, adult league
        "recreational": (160, 30) }   # after the career: still training, still checking in

def ability(age, peak, fall, rise=0.045):
    if age <= peak: return 1.0 - rise*(peak-age)
    d=age-peak
    return 1.0 - fall*d - 0.0016*d*d

athletes=[]
for sp in SPORTS:
    for k in range(25):
        ageless = random.random() < 0.06
        athletes.append(dict(
            id=len(athletes)+1, sport=sp, name=f"{sp[:2].upper()}-{k+1:02d}",
            peak=PEAK[sp]+random.gauss(0,1.3),
            fall=(random.gauss(0.0085,0.0022) if ageless else random.gauss(0.0240,0.0070)),
            ageless=ageless, talent=random.gauss(1.0,0.095),
            base=random.gauss(0.300,0.022), sleeper=random.gauss(1.0,0.10),
            cliffAt=(random.randint(20,40) if random.random()<0.18 else None),
            cliffSize=random.uniform(0.045,0.110),
            # how far they get: decided by talent, with a lot of noise
            ceiling=None))
for a in athletes:
    score=a["talent"]+random.gauss(0,0.06)
    a["ceiling"] = "pro" if score>1.13 else ("semi" if score>1.00 else "club")
    # the age the competitive career ends
    if a["ceiling"]=="pro":  a["retireAge"]=random.randint(28,37) + (6 if a["ageless"] else 0)
    elif a["ceiling"]=="semi": a["retireAge"]=random.randint(23,29)
    else:                    a["retireAge"]=random.randint(18,23)

T={sp:tunables(sp) for sp in SPORTS}
rows=[]
for a in athletes:
    rng=random.Random(a["id"]*7919+SEED)
    t=T[a["sport"]]
    ka=math.exp(-1/t["acuteTauDays"]); kc=math.exp(-1/t["chronicTauDays"]); kw=math.exp(-1/t["wearTauDays"])
    for age in range(START_AGE, END_AGE+1):
        if age<18: stage="youth"
        elif age<23: stage="hs_college"
        elif age<=a["retireAge"]: stage = "pro" if a["ceiling"]=="pro" else "semi"
        else: stage="recreational"
        days, dayload = STAGE[stage]
        lv = ability(age, a["peak"], a["fall"]) * a["talent"]
        if a["cliffAt"] is not None and age>=a["cliffAt"]:
            lv -= a["cliffSize"]*min(1.0, 0.45+0.55*(age-a["cliffAt"]))
        acute=chronic=wear=0.0; anc=[]; win=[]; loads=[]
        for d in range(days):
            L = dayload*rng.gauss(1.0,0.28)
            if rng.random()<0.15: L*=0.25                      # an easy or missed day
            acute=acute*ka+L*t["acuteGain"]
            chronic=chronic*kc+L*(1-kc); wear=wear*kw+L*(1-kw)
            v=(a["base"]/max(lv,0.30))*(1 + t["acuteWeight"]*acute/2.2
                                          + t["chronicWeight"]*chronic/66.0
                                          + t["wearWeight"]*wear/66.0) + rng.gauss(0,NOISE)
            if d < days*0.25: anc.append(v)
            if d > days-45: win.append(v); loads.append(L)
        rows.append(dict(id=a["id"], sport=a["sport"], age=age, stage=stage,
                         ageless=a["ageless"], ceiling=a["ceiling"],
                         cliff=a["cliffAt"], retireAge=a["retireAge"],
                         level=round(lv,5), anchor=round(st.mean(anc),6),
                         end=round(st.mean(win),6), load=round(st.mean(loads),2),
                         season=round(st.mean(anc+win),6)))
json.dump(dict(rows=rows, athletes=athletes, seed=SEED), open(f"life_{SEED}.json","w"))
by=defaultdict(int)
for r in rows: by[r["stage"]]+=1
print(f"seed {SEED} | 75 athletes (25 x 3 sports) | ages {START_AGE}-{END_AGE} | "
      f"{len(rows)} athlete-years")
print("  ceilings: " + ", ".join(f"{c} {sum(1 for a in athletes if a['ceiling']==c)}"
                                 for c in ("pro","semi","club"))
      + f" | ageless {sum(1 for a in athletes if a['ageless'])}"
      + f" | cliffs {sum(1 for a in athletes if a['cliffAt'] is not None)}")
print("  stage-years: " + ", ".join(f"{k} {v}" for k,v in sorted(by.items())))
print(f"  still COMPETING at: " + ", ".join(
    f"{age}: {sum(1 for a in athletes if a['retireAge']>=age)}" for age in (18,22,26,30,35,40)))
