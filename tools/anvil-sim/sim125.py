"""125 man roster, 17 game season, a real injury table including season-enders in rehab.

Same fatigue model as the five man test. What is new: depth chart (a starter plays 60 snaps,
a scout team freshman plays none), an injury generator with a severity distribution, and a
REHAB load profile -- a season-ending knee still trains every day, just completely differently.
"""
import math, random, datetime as dt, json, statistics as st, sys
from collections import defaultdict
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 1125
random.seed(SEED)

START = dt.date(2026, 8, 3)
# 17 games: 12 regular + conference title + 3 playoff rounds + 1 extra. Saturdays, two byes.
GAMES = {}
d, g, byes = dt.date(2026, 8, 29), 0, {dt.date(2026,10,17), dt.date(2026,11,21)}
while g < 17:
    if d not in byes:
        g += 1; GAMES[d] = {"n": g, "away": g % 2 == 0, "playoff": g > 13}
    d += dt.timedelta(days=7)
END = max(GAMES) + dt.timedelta(days=7)

GROUPS = [("QB",5,0.72),("RB",10,1.20),("WR",15,0.95),("TE",8,1.15),("OL",18,1.30),
          ("DL",18,1.28),("LB",15,1.22),("DB",22,1.06),("ST",8,1.10),("WO",6,0.90)]
TIERS = [("starter",0.26,1.00),("rotation",0.34,0.72),("reserve",0.24,0.40),("scout",0.16,0.18)]

roster = []
i = 0
for pos, n, coll in GROUPS:
    for k in range(n):
        r = random.random(); acc = 0; tier = "scout"
        for t, share, _ in TIERS:
            acc += share
            if r <= acc: tier = t; break
        snap = dict((t, s) for t, _, s in TIERS)[tier]
        i += 1
        roster.append({"id": i, "name": f"{pos}-{k+1:02d}", "pos": pos, "tier": tier,
                       "coll": coll, "snap": snap,
                       "drive0": random.gauss(0.272, 0.022), "head0": random.gauss(247, 13),
                       "sleeper": random.gauss(1.0, 0.11)})

# ---- injuries: rate and severity from the shape of a real season ----
SEV = [("knock",      0.46, (1, 5)),      # out days
       ("moderate",   0.31, (6, 20)),
       ("severe",     0.16, (21, 52)),
       ("season_end", 0.07, (900, 900))]
injuries = []
for a in roster:
    # exposure scales with contact and with snaps played
    p = 0.0042 * a["coll"] * (0.45 + a["snap"])
    day = dt.date(2026, 8, 10)
    while day <= max(GAMES):
        if random.random() < p * (2.6 if day in GAMES else 1.0):
            r, acc = random.random(), 0
            for lab, share, rng in SEV:
                acc += share
                if r <= acc: break
            out = random.randint(*rng)
            injuries.append({"id": a["id"], "start": day, "end": day + dt.timedelta(days=out),
                             "kind": lab, "days": out})
            day += dt.timedelta(days=out + 14)
        else:
            day += dt.timedelta(days=1)
inj_by = defaultdict(list)
for x in injuries: inj_by[x["id"]].append(x)

def status(a, day):
    for x in inj_by[a["id"]]:
        if x["start"] <= day <= x["end"]:
            days_in = (day - x["start"]).days
            if x["kind"] == "season_end":
                # surgery, then rehab: no captures for 3 weeks, then a rehab block that trains daily
                return "post_op" if days_in < 21 else "rehab"
            if x["kind"] == "severe" and days_in > 14: return "rehab"
            return "out"
    return "ok"

def base_load(day, a, stat):
    wd = day.weekday()
    if stat in ("out", "post_op"): return 0.0
    if stat == "rehab":            return 26 + (10 if wd in (1,2) else 0)   # daily, flat, low
    if day < dt.date(2026, 8, 24):
        return (88 if (day-START).days//7 < 2 else 76) if wd != 6 else 15
    if day in GAMES:               return 30 + 78 * a["snap"]               # snaps decide the hit
    return {6:22, 0:36, 1:72, 2:66, 3:41, 4:14, 5:24}[wd]

rows = []
for a in roster:
    rng = random.Random(a["id"] * 7919 + SEED)
    df = hf = sd_ = 0.0
    day = START
    while day <= END:
        stat = status(a, day)
        load = base_load(day, a, stat) * (a["coll"] if stat not in ("rehab",) else 1.0)
        slp = 7.4 * a["sleeper"]
        if day in GAMES and stat == "ok": slp -= 1.9 if GAMES[day]["away"] else 1.4
        if day - dt.timedelta(days=1) in GAMES: slp += 0.5
        if dt.date(2026,10,5) <= day <= dt.date(2026,10,9): slp -= 0.8
        slp = max(3.8, slp + rng.gauss(0, 0.55))
        sd_ = max(0.0, sd_ * 0.72 + (7.6 - slp) * 0.6)
        df = df * math.exp(-1/3.5) + load * 0.030
        hf = hf * math.exp(-1/1.8) + load * 0.012 + sd_ * 0.55
        if stat not in ("out", "post_op"):
            rows.append({"id": a["id"], "pos": a["pos"], "tier": a["tier"], "st": stat,
                         "date": day.isoformat(), "wd": day.weekday(), "game": day in GAMES,
                         "drive": a["drive0"] * (1 + 0.055*df/2.2) + rng.gauss(0, 0.0115),
                         "head":  a["head0"]  * (1 + 0.047*hf/2.2) + rng.gauss(0, 20.0)})
        day += dt.timedelta(days=1)

# ---- the FIXED rule: last 20 captures, floor 10 ----
by = defaultdict(list)
for r in rows: by[r["id"]].append(r)
for n, rs in by.items():
    for i, r in enumerate(rs):
        prev = rs[max(0, i-20):i]
        r["age"] = (dt.date.fromisoformat(r["date"]) - dt.date.fromisoformat(prev[0]["date"])).days if prev else 0
        for ch in ("drive","head"):
            if len(prev) < 10: r[ch+"_z"] = None; continue
            v = [h[ch] for h in prev]; m, s = st.mean(v), st.pstdev(v)
            r[ch+"_z"] = (r[ch]-m)/s if s > 0 else 0.0

json.dump({"rows": rows, "roster": roster,
           "injuries": [{**x, "start": x["start"].isoformat(), "end": x["end"].isoformat()} for x in injuries],
           "games": {k.isoformat(): v for k,v in GAMES.items()}},
          open(f"out125_{SEED}.json","w"))
c = defaultdict(int)
for x in injuries: c[x["kind"]] += 1
print(f"seed {SEED} | roster {len(roster)} | captures {len(rows)} | games {len(GAMES)} | injuries {len(injuries)}: "
      + ", ".join(f"{k} {v}" for k,v in c.items()))
