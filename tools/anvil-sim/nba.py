"""18 man NBA roster, camp through game 7 of the Finals, on the same three-state model.

Why this is a third test and not baseball again:
  - the SCHEDULE is irregular.  82 games in 174 days, in clusters: back-to-backs, four in five
    nights, then three days off.  Baseball is one a day; football is one a week; this is neither.
  - LOAD MANAGEMENT.  A star is rested on the back end of a back-to-back, healthy, by decision.
    That is a zero-load day that is not an injury and not a day off for anyone else.
  - MINUTES ARE BIMODAL PER ATHLETE.  A rotation player plays 24 minutes or does not play at all,
    and the end of the bench plays in garbage time or never.  Neither other sport does this.
  - a RETURN RAMP: an injured player comes back on a minutes restriction for weeks.
  - 18 men is barely over the cohort floor a roster-relative statistic needs, which is itself
    one of the things this run is here to find out.

basketball is DEFAULTED in tau.py -- nobody has fitted it -- and it runs that way on purpose.
"""
import math, random, datetime as dt, json, statistics as st, sys
from collections import defaultdict
from tau import tunables
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 3001
random.seed(SEED)
T=tunables("basketball")

CAMP   = dt.date(2026,9,29)          # media day / camp opens
OPEN   = dt.date(2026,10,21)         # opening night
REG_END= dt.date(2027,4,15)

# --- 82 games in 174 days, spaced by a real gap distribution ---
# A back-to-back is a gap of ONE day and a real team gets about 13-15 a season, not 39.
# Mean gap ~2.1 days is what puts 82 games inside the window.
GAPS=[(1,0.16),(2,0.45),(3,0.25),(4,0.09),(5,0.05)]
games={}; day=OPEN; n=0
while n<82 and day<=REG_END:
    n+=1
    b2b=(day-dt.timedelta(days=1)) in games
    games[day]={"n":n,"away":random.random()<0.52,"b2b":b2b,"post":False}
    if b2b: games[day]["away"]=games[day-dt.timedelta(days=1)]["away"]   # second half of a trip
    left=(REG_END-day).days; need=82-n
    if need<=0: break
    # pull the gap in if the calendar is getting tight, push it out if there is room
    room=left/max(need,1)
    r=random.random(); acc=0; gap=2
    for g,p in GAPS:
        acc+=p
        if r<=acc: gap=g; break
    if room<2.1: gap=min(gap, 2 if room>1.5 else 1)      # behind: tighten, up to a back-to-back
    if room>2.9 and gap<3: gap+=1                          # ahead: spread out
    day+=dt.timedelta(days=gap)
# play-in (2) then four rounds of seven, two days between rounds
pd_=REG_END+dt.timedelta(days=3); p=0
for rnd,cnt in (("PI",2),("R1",7),("CSF",7),("CF",7),("F",7)):
    for g in range(cnt):
        p+=1; games[pd_]={"n":82+p,"away":g%2==1,"b2b":False,"post":True,"round":rnd}
        pd_+=dt.timedelta(days=2 if rnd!="PI" else 3)
    pd_+=dt.timedelta(days=3)
END=max(games)

# --- the roster: 15 standard + 3 two-way, minutes heavily skewed ---
TIERS=[("star",2,36.0),("starter",3,31.0),("rotation",4,22.0),
       ("bench",3,11.0),("deep",3,3.0),("twoway",3,6.0)]
roster=[]; i=0
for tier,cnt,mins in TIERS:
    for k in range(cnt):
        i+=1
        roster.append({"id":i,"name":f"{tier[:3].upper()}-{k+1}","tag":tier,"kind":tier,
                       "mins":mins*random.gauss(1.0,0.08),
                       "base":random.gauss(0.272,0.020),"sleeper":random.gauss(1.0,0.10),
                       # rest games a season: a star is managed, the deep bench never is
                       "restGames":{"star":11,"starter":5,"rotation":2,"bench":0,"deep":0,"twoway":0}[tier]})
NDEC=max(2,len(roster)//8)
for a in random.sample(roster,NDEC):
    a["decline"]={"kind":"fast","start":random.randint(90,190),"size":-random.uniform(.6,1.2)}
for a in random.sample([x for x in roster if "decline" not in x],NDEC):
    a["decline"]={"kind":"slow","start":30,"size":-random.uniform(.8,1.6)}

# --- injuries: NBA rate, with a minutes restriction on the way back ---
SEV=[("knock",0.42,(1,4)),("moderate",0.33,(5,18)),("severe",0.18,(19,45)),("season_end",0.07,(900,900))]
inj=[]
for a in roster:
    p=0.0030*(0.5+a["mins"]/36.0)
    d=OPEN
    while d<=REG_END:
        if random.random()<p*(1.9 if d in games else 1.0):
            r,acc=random.random(),0
            for lab,share,rng_ in SEV:
                acc+=share
                if r<=acc: break
            out=random.randint(*rng_)
            inj.append({"id":a["id"],"start":d,"end":d+dt.timedelta(days=out),"kind":lab})
            d+=dt.timedelta(days=out+10)
        else: d+=dt.timedelta(days=1)
inj_by=defaultdict(list)
for x in inj: inj_by[x["id"]].append(x)
def status(a,d):
    for x in inj_by[a["id"]]:
        if x["start"]<=d<=x["end"]:
            di=(d-x["start"]).days
            if x["kind"]=="season_end": return "post_op" if di<28 else "rehab"
            return "out"
        # a minutes restriction for 10 days after a moderate or worse absence
        if x["kind"] in ("moderate","severe") and x["end"]<d<=x["end"]+dt.timedelta(days=10):
            return "ramp"
    return "ok"

# which games each athlete is rested for: weighted to the back end of a back-to-back
gdays=sorted(games)
rest_by={}
for a in roster:
    if a["restGames"]==0: rest_by[a["id"]]=set(); continue
    cand=[d for d in gdays if not games[d]["post"]]
    wt=[(4.0 if games[d]["b2b"] else 1.0) for d in cand]
    picked=set()
    while len(picked)<a["restGames"] and len(picked)<len(cand):
        picked.add(random.choices(cand,weights=wt,k=1)[0])
    rest_by[a["id"]]=picked

ka=math.exp(-1/T["acuteTauDays"]); kc=math.exp(-1/T["chronicTauDays"]); kw=math.exp(-1/T["wearTauDays"])
rows=[]
for a in roster:
    rng=random.Random(a["id"]*7919+SEED)
    acute=chronic=wear=sd_=0.0
    d=CAMP
    while d<=END:
        g=games.get(d); stt=status(a,d)
        rested = g is not None and d in rest_by[a["id"]] and stt=="ok"
        if stt in ("out","post_op"): L=0.0
        elif stt=="rehab":           L=24.0
        elif d<OPEN:                 L=46.0 if rng.random()<0.75 else 18.0      # camp + preseason
        elif g is None:              L=20.0                                      # practice / travel
        elif rested:                 L=8.0                                       # on the bench, in a suit
        else:
            mins=a["mins"]*(0.55 if stt=="ramp" else 1.0)
            if a["tag"]=="twoway" and rng.random()<0.6: mins=28.0                # sent to the G-League
            if a["tag"]=="deep" and rng.random()<0.72: mins=0.0                  # DNP, coach's decision
            L=2.6*mins*(1.12 if g.get("post") else 1.0)
        slp=7.5*a["sleeper"]
        if g:
            if g["away"]: slp-=1.2
            if g["b2b"]:  slp-=0.9
            if g.get("post"): slp-=0.4
        slp=max(3.9,slp+rng.gauss(0,0.5))
        sd_=max(0.0,sd_*0.72+(7.6-slp)*0.6)
        acute   = acute*ka   + L*T["acuteGain"]
        drive   = L + 9.0*sd_
        chronic = chronic*kc + drive*(1-kc)
        wear    = wear*kw    + drive*(1-kw)
        doy=(d-CAMP).days
        dec=0.0
        if "decline" in a:
            dd=a["decline"]
            if dd["kind"]=="fast" and doy>=dd["start"]: dec=dd["size"]
            elif dd["kind"]=="slow": dec=dd["size"]*max(0.0,min(1.0,(doy-dd["start"])/200.0))
        if stt!="post_op":
            rows.append({"id":a["id"],"tag":a["tag"],"kind":a["kind"],"st":stt,
                         "date":d.isoformat(),"doy":doy,"game":g is not None,
                         "rested":rested,"post":bool(g and g.get("post")),
                         "load":round(L,1),"acute":round(acute,3),"chronic":round(chronic,3),
                         "wear":round(wear,3),
                         "v":a["base"]*(1+T["acuteWeight"]*acute/2.2
                                          +T["chronicWeight"]*chronic/66.0
                                          +T["wearWeight"]*wear/66.0)
                            - dec*0.0022 + rng.gauss(0,0.0115)})
        d+=dt.timedelta(days=1)

json.dump({"rows":rows,"roster":roster,"tunables":T,"seasonDays":(END-CAMP).days,
           "injuries":[{**x,"start":x["start"].isoformat(),"end":x["end"].isoformat()} for x in inj],
           "games":{k.isoformat():v for k,v in games.items()}},
          open(f"nba_{SEED}.json","w"))
b2b=sum(1 for v in games.values() if v["b2b"])
restn=sum(len(v) for v in rest_by.values())
c=defaultdict(int)
for x in inj: c[x["kind"]]+=1
print(f"seed {SEED} | roster {len(roster)} | {(END-CAMP).days} days | {len(games)} games "
      f"({b2b} back-to-backs, {sum(1 for v in games.values() if v['post'])} postseason) | "
      f"captures {len(rows)} | defaulted taus {T['acuteTauDays']}/{T['chronicTauDays']}/{T['wearTauDays']}")
print(f"  declines {NDEC}+{NDEC} | load-management rest games {restn} | injuries {len(inj)}: "
      + ", ".join(f"{k} {v}" for k,v in c.items()))
