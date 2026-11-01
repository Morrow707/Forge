"""40 man roster, pitchers and catchers report through game 7 of the World Series.

Why this is not the football test again:
  - games are DAILY, so there is no weekly rhythm to hide in
  - roles diverge violently: a starter works every 5th day, a catcher squats 150 times a night
  - it runs 255 days, twice the football season, which is the first test long enough to ask
    whether a ROLLING OWN BASELINE can see a slow decline or simply follows the athlete down.
"""
import math, random, datetime as dt, statistics as st, json, sys
from collections import defaultdict
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 2702
random.seed(SEED)

REPORT   = dt.date(2026,2,14)          # pitchers and catchers
FULLSQUAD= dt.date(2026,2,19)
SPRING1  = dt.date(2026,2,24)
OPENING  = dt.date(2026,3,26)
# 162 games with ~20 off days, then max playoffs: WC3 + DS5 + CS7 + WS7 = 22
day, games, n = OPENING, {}, 0
offdays=set()
while n < 162:
    # roughly one off day a week, more in April
    if day.weekday()==0 and random.random()<0.62: offdays.add(day)
    else:
        n+=1; games[day]={"n":n,"post":False,"away":random.random()<0.5}
    day+=dt.timedelta(days=1)
REG_END=max(games)
pd_=REG_END+dt.timedelta(days=3); p=0
for rnd,cnt in (("WC",3),("DS",5),("CS",7),("WS",7)):
    for g in range(cnt):
        p+=1; games[pd_]={"n":162+p,"post":True,"round":rnd,"away":g%2==1}
        pd_+=dt.timedelta(days=1)
    pd_+=dt.timedelta(days=2)       # travel day between rounds
END=max(games)

ROLES=[("SP",5,"starter"),("RP",9,"pen"),("C",3,"catcher"),("IF",7,"field"),
       ("OF",6,"field"),("UT",2,"field"),("AAA",8,"shuttle")]
roster=[]; i=0
for tag,cnt,kind in ROLES:
    for k in range(cnt):
        i+=1
        roster.append({"id":i,"name":"%s-%d"%(tag,k+1),"tag":tag,"kind":kind,
            "base":random.gauss(0.272,0.020),"sleeper":random.gauss(1.0,0.10),
            "slot":k})

# a real decline in a quarter of them: FAST (a few weeks) or SLOW (the whole season)
for a in random.sample(roster,10):
    a["decline"]={"kind":"fast","start":random.randint(90,170),"size":-random.uniform(.6,1.2)}
for a in random.sample([x for x in roster if "decline" not in x],10):
    a["decline"]={"kind":"slow","start":30,"size":-random.uniform(.8,1.6)}

def load(a, d, g):
    """training + game load for this athlete on this date."""
    doy=(d-REPORT).days
    if d < SPRING1:                                   # camp buildup
        return 42 if a["kind"]!="starter" else 38
    if d < OPENING:                                   # spring games
        base = 48 if random.random()<0.6 else 25
        return base*(1.15 if a["kind"]=="catcher" else 1.0)
    if g is None: return 14                           # off day: light lift
    k=a["kind"]
    if k=="starter":
        # a five man rotation: full outing, then a bullpen on day 3
        phase=(g["n"]+a["slot"])%5
        return 100 if phase==0 else (45 if phase==2 else 16)
    if k=="pen":
        # appears ~45% of games, can go back to back, never three
        return 58 if random.random()<0.45 else 12
    if k=="catcher":
        return 92 if random.random()<0.78 else 20     # catches ~78% of games
    if k=="field":
        return 70 if random.random()<0.88 else 18
    return 70 if random.random()<0.22 else 10         # shuttle guy

rows=[]
for a in roster:
    rng=random.Random(a["id"]*7919+SEED); f=0.0; sd_=0.0
    d=REPORT
    while d<=END:
        g=games.get(d); L=load(a,d,g)
        slp=7.5*a["sleeper"]
        if g:
            if g["away"]: slp-=1.1
            if g.get("post"): slp-=0.5
            # getaway day: a night game then a travel morning
            if g["away"] and (d+dt.timedelta(days=1)) in games and not games[d+dt.timedelta(days=1)]["away"]:
                slp-=0.8
        slp=max(3.9,slp+rng.gauss(0,0.5))
        sd_=max(0.0,sd_*0.72+(7.6-slp)*0.6)
        f=f*math.exp(-1/3.5)+L*0.030
        doy=(d-REPORT).days
        dec=0.0
        if "decline" in a:
            dd=a["decline"]
            if dd["kind"]=="fast" and doy>=dd["start"]: dec=dd["size"]
            elif dd["kind"]=="slow": dec=dd["size"]*max(0.0,min(1.0,(doy-dd["start"])/190.0))
        val=a["base"]*(1+0.055*f/2.2) - dec*0.0022 + rng.gauss(0,0.0115)
        rows.append({"id":a["id"],"tag":a["tag"],"kind":a["kind"],"date":d.isoformat(),
                     "doy":doy,"game":g is not None,"post":bool(g and g.get("post")),
                     "load":round(L,1),"v":val})
        d+=dt.timedelta(days=1)

json.dump({"rows":rows,"roster":roster,"games":{k.isoformat():v for k,v in games.items()},
           "report":REPORT.isoformat(),"opening":OPENING.isoformat(),"end":END.isoformat()},
          open(f"mlb_{SEED}.json","w"))
print(f"seed {SEED} | {REPORT} -> {END} ({(END-REPORT).days} days) | "
      f"{len(games)} games ({sum(1 for g in games.values() if g['post'])} postseason) | "
      f"{len(offdays)} off days | {len(rows)} captures | slow decliners 10, fast 10")
