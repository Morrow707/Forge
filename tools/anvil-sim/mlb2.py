"""FIX 1: two fatigue states.  Same 40-man roster, same 248 days, same seeds as mlb.py.

mlb.py had ONE pool at tau 3.5 days, which is why the time test found nothing: a pool that
clears in a week cannot carry a season.  It rose 3.98 -> 5.02 by late April and then sat flat
to October, so the only slow decline in that sim was an INJECTED term, and a rolling own
baseline is blind to an injected ramp by construction.

"Two states" was the first answer and plateau.py disproved it: an exponential pool is at 95%
of its ceiling after 3 tau, so a 28 day pool is FLAT from June to September (-1.2% measured) and
cannot carry a season either.  Three, and the third is not a fatigue pool:
  acute   tau 3.5d   -- yesterday's game.  This is what Anvil's daily z already measures.
  chronic tau 28d    -- the month behind you: off-day density, road stretches, postseason.
                        It plateaus by June, and that is CORRECT -- it describes the month.
  wear    tau 120d   -- the season.  Cumulative work with a leak slow enough to ignore; it is
                        at 87% of its ceiling on the last day, i.e. still rising throughout.
All three taus come from tau.py, per sport, so a baseball number cannot reach a football athlete.
"""
import math, random, datetime as dt, statistics as st, json, sys
from collections import defaultdict
from tau import tunables
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 2702
random.seed(SEED)
T=tunables("baseball")

REPORT=dt.date(2026,2,14); FULLSQUAD=dt.date(2026,2,19)
SPRING1=dt.date(2026,2,24); OPENING=dt.date(2026,3,26)
day,games,n=OPENING,{},0; offdays=set()
while n<162:
    # off days get SCARCER as the season goes on, which is what drives the chronic pool
    doy=(day-OPENING).days
    pOff = 0.62 if doy<60 else (0.50 if doy<130 else 0.34)
    if day.weekday()==0 and random.random()<pOff: offdays.add(day)
    else:
        n+=1; games[day]={"n":n,"post":False,"away":random.random()<0.5}
    day+=dt.timedelta(days=1)
REG_END=max(games); pd_=REG_END+dt.timedelta(days=3); p=0
for rnd,cnt in (("WC",3),("DS",5),("CS",7),("WS",7)):
    for g in range(cnt):
        p+=1; games[pd_]={"n":162+p,"post":True,"round":rnd,"away":g%2==1}
        pd_+=dt.timedelta(days=1)
    pd_+=dt.timedelta(days=2)
END=max(games)

ROLES=[("SP",5,"starter"),("RP",9,"pen"),("C",3,"catcher"),("IF",7,"field"),
       ("OF",6,"field"),("UT",2,"field"),("AAA",8,"shuttle")]
roster=[]; i=0
for tag,cnt,kind in ROLES:
    for k in range(cnt):
        i+=1
        roster.append({"id":i,"name":"%s-%d"%(tag,k+1),"tag":tag,"kind":kind,
            "base":random.gauss(0.272,0.020),"sleeper":random.gauss(1.0,0.10),"slot":k})
for a in random.sample(roster,10):
    a["decline"]={"kind":"fast","start":random.randint(90,170),"size":-random.uniform(.6,1.2)}
for a in random.sample([x for x in roster if "decline" not in x],10):
    a["decline"]={"kind":"slow","start":30,"size":-random.uniform(.8,1.6)}

def load(a,d,g):
    if d<SPRING1: return 42 if a["kind"]!="starter" else 38
    if d<OPENING: return (48 if random.random()<0.6 else 25)*(1.15 if a["kind"]=="catcher" else 1.0)
    if g is None: return 14
    k=a["kind"]; post=1.10 if g.get("post") else 1.0
    if k=="starter":
        phase=(g["n"]+a["slot"])%5
        return (100 if phase==0 else (45 if phase==2 else 16))*post
    if k=="pen":    return (58 if random.random()<0.45 else 12)*post
    if k=="catcher":return (92 if random.random()<0.78 else 20)*post
    if k=="field":  return (70 if random.random()<0.88 else 18)*post
    return (70 if random.random()<0.22 else 10)*post

ka = math.exp(-1/T["acuteTauDays"])
kc = math.exp(-1/T["chronicTauDays"])
kw = math.exp(-1/T["wearTauDays"])
rows=[]
for a in roster:
    rng=random.Random(a["id"]*7919+SEED); acute=0.0; chronic=0.0; wear=0.0; sd_=0.0
    d=REPORT
    while d<=END:
        g=games.get(d); L=load(a,d,g)
        slp=7.5*a["sleeper"]
        if g:
            if g["away"]: slp-=1.1
            if g.get("post"): slp-=0.5
            nxt=d+dt.timedelta(days=1)
            if g["away"] and nxt in games and not games[nxt]["away"]: slp-=0.8
        slp=max(3.9,slp+rng.gauss(0,0.5))
        sd_=max(0.0,sd_*0.72+(7.6-slp)*0.6)
        # the acute pool is UNCHANGED from the single-pool model, on purpose: this fix adds
        # channels, it does not move the one that already works.  The prediction to test is
        # that the acute flag rate barely moves, because a rolling 20-capture baseline absorbs
        # anything slower than ~20 days -- which is the very claim that makes the other two
        # channels necessary.  If it DOES move, the claim is wrong.
        acute   = acute*ka   + L*T["acuteGain"]
        # the two slow pools are normalised EWMAs in LOAD units, so their weights are
        # directly comparable and a fitted weight means something.
        # sleep debt feeds the slow pools, not the acute one: one bad night is noise,
        # three weeks of 5am flights is the thing these channels exist to see.
        drive   = L + 9.0*sd_
        chronic = chronic*kc + drive*(1-kc)
        wear    = wear*kw    + drive*(1-kw)
        doy=(d-REPORT).days
        dec=0.0
        if "decline" in a:
            dd=a["decline"]
            if dd["kind"]=="fast" and doy>=dd["start"]: dec=dd["size"]
            elif dd["kind"]=="slow": dec=dd["size"]*max(0.0,min(1.0,(doy-dd["start"])/190.0))
        val=(a["base"]*(1 + T["acuteWeight"]*acute/2.2
                          + T["chronicWeight"]*chronic/66.0
                          + T["wearWeight"]*wear/66.0)
             - dec*0.0022 + rng.gauss(0,0.0115))
        rows.append({"id":a["id"],"tag":a["tag"],"kind":a["kind"],"date":d.isoformat(),
                     "doy":doy,"game":g is not None,"post":bool(g and g.get("post")),
                     "load":round(L,1),"acute":round(acute,3),"chronic":round(chronic,3),
                     "wear":round(wear,3),"v":val})
        d+=dt.timedelta(days=1)

json.dump({"rows":rows,"roster":roster,"tunables":T,
           "games":{k.isoformat():v for k,v in games.items()},
           "report":REPORT.isoformat(),"opening":OPENING.isoformat(),"end":END.isoformat()},
          open(f"mlb2_{SEED}.json","w"))
# did the chronic pool actually do anything, or did it plateau like the old one?
by=defaultdict(lambda:defaultdict(list))
for r in rows:
    for ch in ("acute","chronic","wear"): by[r["date"][:7]][ch].append(r[ch])
print(f"seed {SEED} | {len(games)} games | {len(rows)} captures | "
      f"tau {T['acuteTauDays']}/{T['chronicTauDays']}/{T['wearTauDays']}")
print(f"  {'month':<9}{'acute':>8}{'chronic':>9}{'wear':>8}")
for m in sorted(by):
    b=by[m]; print(f"  {m:<9}{st.mean(b['acute']):>8.2f}{st.mean(b['chronic']):>9.1f}{st.mean(b['wear']):>8.1f}")
