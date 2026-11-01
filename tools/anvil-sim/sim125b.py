"""125 man football roster, 17 games -- rebuilt on the SAME three-state model as the MLB run,
so the two can be put side by side.

Everything that is sport-shaped comes from tau.py("football"); everything that is a RULE -- the
injury table, the depth chart, the rehab load profile, the decline generator, the detector -- is
identical to the baseball run.  The point of the comparison is to find out which of the two
channels survives a schedule with one spike a week and 119 days to work in, against one with a
spike every day and 248.

The injected declines are the same prevalence and the same sizes as the baseball run (25% of the
roster, 0.6-1.2 fast and 0.8-1.6 slow in fatigue units) so detection numbers are comparable.
The slow ramp is scaled to the season: 95 days here against 190 there, i.e. the same fraction.
"""
import math, random, datetime as dt, json, statistics as st, sys
from collections import defaultdict
from tau import tunables
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 1125
random.seed(SEED)
T=tunables("football")

START=dt.date(2026,8,3)
GAMES={}; d,g=dt.date(2026,8,29),0
byes={dt.date(2026,10,17), dt.date(2026,11,21)}
while g<17:
    if d not in byes:
        g+=1; GAMES[d]={"n":g,"away":g%2==0,"playoff":g>13}
    d+=dt.timedelta(days=7)
END=max(GAMES)+dt.timedelta(days=7)
SEASON_DAYS=(END-START).days

GROUPS=[("QB",5,0.72),("RB",10,1.20),("WR",15,0.95),("TE",8,1.15),("OL",18,1.30),
        ("DL",18,1.28),("LB",15,1.22),("DB",22,1.06),("ST",8,1.10),("WO",6,0.90)]
TIERS=[("starter",0.26,1.00),("rotation",0.34,0.72),("reserve",0.24,0.40),("scout",0.16,0.18)]
roster=[]; i=0
for pos,n,coll in GROUPS:
    for k in range(n):
        r=random.random(); acc=0; tier="scout"
        for t,share,_ in TIERS:
            acc+=share
            if r<=acc: tier=t; break
        snap=dict((t,s) for t,_,s in TIERS)[tier]
        i+=1
        roster.append({"id":i,"name":f"{pos}-{k+1:02d}","pos":pos,"tier":tier,"coll":coll,
                       "snap":snap,"drive0":random.gauss(0.272,0.022),
                       "sleeper":random.gauss(1.0,0.11)})

# same prevalence as the baseball run: 25% of the roster, half fast half slow
NDEC=len(roster)//8
for a in random.sample(roster,NDEC):
    a["decline"]={"kind":"fast","start":random.randint(40,85),"size":-random.uniform(.6,1.2)}
for a in random.sample([x for x in roster if "decline" not in x],NDEC):
    a["decline"]={"kind":"slow","start":15,"size":-random.uniform(.8,1.6)}

SEV=[("knock",0.46,(1,5)),("moderate",0.31,(6,20)),("severe",0.16,(21,52)),
     ("season_end",0.07,(900,900))]
injuries=[]
for a in roster:
    p=0.0042*a["coll"]*(0.45+a["snap"]); day=dt.date(2026,8,10)
    while day<=max(GAMES):
        if random.random()<p*(2.6 if day in GAMES else 1.0):
            r,acc=random.random(),0
            for lab,share,rng_ in SEV:
                acc+=share
                if r<=acc: break
            out=random.randint(*rng_)
            injuries.append({"id":a["id"],"start":day,"end":day+dt.timedelta(days=out),
                             "kind":lab,"days":out})
            day+=dt.timedelta(days=out+14)
        else: day+=dt.timedelta(days=1)
inj_by=defaultdict(list)
for x in injuries: inj_by[x["id"]].append(x)

def status(a,day):
    for x in inj_by[a["id"]]:
        if x["start"]<=day<=x["end"]:
            di=(day-x["start"]).days
            if x["kind"]=="season_end": return "post_op" if di<21 else "rehab"
            if x["kind"]=="severe" and di>14: return "rehab"
            return "out"
    return "ok"

def base_load(day,a,stat):
    wd=day.weekday()
    if stat in ("out","post_op"): return 0.0
    if stat=="rehab": return 26+(10 if wd in (1,2) else 0)
    if day<dt.date(2026,8,24):
        return (88 if (day-START).days//7<2 else 76) if wd!=6 else 15
    if day in GAMES: return 30+78*a["snap"]
    return {6:22,0:36,1:72,2:66,3:41,4:14,5:24}[wd]

ka=math.exp(-1/T["acuteTauDays"]); kc=math.exp(-1/T["chronicTauDays"]); kw=math.exp(-1/T["wearTauDays"])
rows=[]
for a in roster:
    rng=random.Random(a["id"]*7919+SEED)
    acute=chronic=wear=sd_=0.0
    day=START
    while day<=END:
        stat=status(a,day)
        L=base_load(day,a,stat)*(a["coll"] if stat!="rehab" else 1.0)
        slp=7.4*a["sleeper"]
        if day in GAMES and stat=="ok": slp-= 1.9 if GAMES[day]["away"] else 1.4
        if day-dt.timedelta(days=1) in GAMES: slp+=0.5
        if dt.date(2026,10,5)<=day<=dt.date(2026,10,9): slp-=0.8
        slp=max(3.8,slp+rng.gauss(0,0.55))
        sd_=max(0.0,sd_*0.72+(7.6-slp)*0.6)
        acute   = acute*ka   + L*T["acuteGain"]
        drive   = L + 9.0*sd_
        chronic = chronic*kc + drive*(1-kc)
        wear    = wear*kw    + drive*(1-kw)
        doy=(day-START).days
        dec=0.0
        if "decline" in a:
            dd=a["decline"]
            if dd["kind"]=="fast" and doy>=dd["start"]: dec=dd["size"]
            elif dd["kind"]=="slow": dec=dd["size"]*max(0.0,min(1.0,(doy-dd["start"])/95.0))
        if stat not in ("out","post_op"):
            rows.append({"id":a["id"],"tag":a["pos"],"kind":a["tier"],"st":stat,
                         "date":day.isoformat(),"doy":doy,"game":day in GAMES,
                         "load":round(L,1),"acute":round(acute,3),"chronic":round(chronic,3),
                         "wear":round(wear,3),
                         "v":a["drive0"]*(1+T["acuteWeight"]*acute/2.2
                                            +T["chronicWeight"]*chronic/66.0
                                            +T["wearWeight"]*wear/66.0)
                             - dec*0.0022 + rng.gauss(0,0.0115)})
        day+=dt.timedelta(days=1)

json.dump({"rows":rows,"roster":roster,"tunables":T,"seasonDays":SEASON_DAYS,
           "injuries":[{**x,"start":x["start"].isoformat(),"end":x["end"].isoformat()} for x in injuries],
           "games":{k.isoformat():v for k,v in GAMES.items()}},
          open(f"fb_{SEED}.json","w"))
c=defaultdict(int)
for x in injuries: c[x["kind"]]+=1
mo=defaultdict(lambda:defaultdict(list))
for r in rows:
    for ch in ("acute","chronic","wear"): mo[r["date"][:7]][ch].append(r[ch])
print(f"seed {SEED} | roster {len(roster)} | {SEASON_DAYS} days | {len(GAMES)} games | "
      f"captures {len(rows)} | tau {T['acuteTauDays']}/{T['chronicTauDays']}/{T['wearTauDays']}")
print(f"  declines {NDEC} fast + {NDEC} slow | injuries {len(injuries)}: "
      + ", ".join(f"{k} {v}" for k,v in c.items()))
print(f"  {'month':<9}{'acute':>8}{'chronic':>9}{'wear':>8}")
for m in sorted(mo):
    b=mo[m]; print(f"  {m:<9}{st.mean(b['acute']):>8.2f}{st.mean(b['chronic']):>9.1f}{st.mean(b['wear']):>8.1f}")
