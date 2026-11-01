"""Careers, not seasons.  A league of teams over many years, with aging, trades and turnover.

WHY THIS IS A NEW TEST AND NOT A LONGER ONE.  Everything up to here measured ONE season against
an anchor taken in that season's camp.  Stretch it to a career and the same structural problem
reappears one level up, and harder:

  within a season   the universal drift is WEAR, and the cure was to score an athlete against
                    the roster, because the roster shares the season
  across a career   the universal drift is AGE, and scoring against the roster does NOT work,
                    because the roster is a mix of 22 and 36 year olds who are not on the same
                    part of the curve, and a third of it is different people every year anyway

WHAT THIS MODEL DOES NOT CONTAIN, said first because it decides what any number here can mean.
Brady at 43, LeBron at 39, Scherzer at 38 were not physiologically 26.  They were better at the
parts that are not physiological: anticipation, preparation, technique, picking their spots,
changing what they do.  None of that is in here.  This model has a body and a schedule and
nothing else, so the most it can ever say is "this athlete's PHYSICAL decline is slower than his
age cohort's".  It cannot say why, and the gap between those two sentences is the whole of what
makes those three who they are.  A product that forgets that will tell a 38 year old to retire.

So the honest question this run can answer is narrower and still worth answering:
  can a channel tell APPROPRIATE aging from a CLIFF, early enough to matter, without flagging
  every athlete over 30 for the crime of being over 30?
"""
import math, random, statistics as st, json, sys
from collections import defaultdict
from tau import tunables

SPORT = sys.argv[1] if len(sys.argv) > 1 else "baseball"
SEED  = int(sys.argv[2]) if len(sys.argv) > 2 else 9001
YEARS = int(sys.argv[3]) if len(sys.argv) > 3 else 14
random.seed(SEED)
T = tunables(SPORT)

CFG = {
    "baseball":   dict(teams=6, roster=40, days=248, anchor=(20, 80),  window=45,
                       entry=(21, 26), peak=27.5, replace=0.62),
    "football":   dict(teams=6, roster=125, days=159, anchor=(13, 51), window=45,
                       entry=(18, 23), peak=26.0, replace=0.70),
    "basketball": dict(teams=6, roster=18, days=273, anchor=(22, 87),  window=45,
                       entry=(19, 24), peak=27.0, replace=0.66),
}[SPORT]

# ---------------------------------------------------------------- the aging curve
# A smooth rise to a peak and an accelerating fall after it.  The FALL rate is where the
# individual variation that matters lives: this is the one parameter that separates a man who
# plays to 42 from one who is finished at 31.
def ability(age, peak, fall, rise=0.030):
    if age <= peak:
        return 1.0 - rise * (peak - age)
    d = age - peak
    return 1.0 - fall * d - 0.0016 * d * d        # linear plus a quadratic that bites after ~30

CUT_SHARE = 0.17           # of the league, every offseason -- this is what sets career length
AGELESS_SHARE = 0.045      # Brady / LeBron / Scherzer class: a much flatter fall
def new_athlete(i, year):
    ageless = random.random() < AGELESS_SHARE
    return {
        "id": i, "born": year - random.randint(*CFG["entry"]),
        "peak": CFG["peak"] + random.gauss(0, 1.3),
        # the fall rate, per year past peak.  The ageless class is a genuinely different draw,
        # not the tail of the normal one -- which is itself a claim this model asserts rather
        # than establishes, and is flagged in the README.
        "fall": (random.gauss(0.0085, 0.0022) if ageless else random.gauss(0.0240, 0.0070)),
        "ageless": ageless,
        "talent": random.gauss(1.0, 0.085),
        "base": random.gauss(0.272, 0.020),
        "sleeper": random.gauss(1.0, 0.10),
        "team": None, "seasons": 0,
        # a CLIFF: a minority fall off a ledge rather than down a slope.  This is the event the
        # channel has to catch, and the only thing in here worth flagging.
        "cliffAt": (random.randint(28, 38) if random.random() < 0.16 else None),
        "cliffSize": random.uniform(0.045, 0.110),
    }

def true_level(a, age, year):
    lv = ability(age, a["peak"], a["fall"]) * a["talent"]
    if a["cliffAt"] is not None and year >= a["cliffYear"]:
        yrs = year - a["cliffYear"]
        lv -= a["cliffSize"] * min(1.0, 0.45 + 0.55 * yrs)     # most of it lands in year one
    return lv

# ---------------------------------------------------------------- one season for one athlete
ka = math.exp(-1 / T["acuteTauDays"]); kc = math.exp(-1 / T["chronicTauDays"])
kw = math.exp(-1 / T["wearTauDays"])
AF, AT = CFG["anchor"]; W = CFG["window"]; DAYS = CFG["days"]

def play_season(a, age, year, rng, loadprofile):
    """Daily captures are generated and REDUCED here; only the season statistics are kept.
    A league over fourteen years is 600k capture rows per sport and the career channel reads
    none of them individually."""
    lv = true_level(a, age, year)
    acute = chronic = wear = sd_ = 0.0
    anc, win, loads = [], [], []
    for d in range(DAYS):
        L = loadprofile(d, a, rng)
        slp = max(3.9, 7.5 * a["sleeper"] + rng.gauss(0, 0.6) - (1.0 if L > 60 else 0.0))
        sd_ = max(0.0, sd_ * 0.72 + (7.6 - slp) * 0.6)
        acute = acute * ka + L * T["acuteGain"]
        drive = L + 9.0 * sd_
        chronic = chronic * kc + drive * (1 - kc)
        wear    = wear    * kw + drive * (1 - kw)
        v = (a["base"] / max(lv, 0.30)) * (1 + T["acuteWeight"] * acute / 2.2
                                             + T["chronicWeight"] * chronic / 66.0
                                             + T["wearWeight"] * wear / 66.0) + rng.gauss(0, 0.0115)
        if AF <= d < AT: anc.append(v)
        if d > DAYS - W: win.append(v); loads.append(L)
    return dict(anchor=st.mean(anc), end=st.mean(win), load=st.mean(loads),
                season_mean=st.mean(anc + win), level=lv)

def profile_for(sport):
    if sport == "baseball":
        return lambda d, a, rng: (42.0 if d < 40 else
                                  (14.0 if rng.random() < 0.12 else
                                   (70.0 if rng.random() < 0.85 else 18.0)))
    if sport == "football":
        return lambda d, a, rng: (80.0 if d < 25 else
                                  (30 + 78 * a["snap"] if d % 7 == 5 else
                                   [22, 36, 72, 66, 41, 14, 24][d % 7]))
    return lambda d, a, rng: (46.0 if d < 25 else
                              (20.0 if rng.random() < 0.45 else
                               2.6 * a.get("mins", 24.0) * rng.gauss(1.0, 0.12)))

# ---------------------------------------------------------------- the league, year by year
teams = list(range(CFG["teams"]))
pool, nid = [], 0
for t in teams:
    for _ in range(CFG["roster"]):
        nid += 1; a = new_athlete(nid, 0); a["team"] = t
        if SPORT == "football": a["snap"] = random.choice([1.0, 0.72, 0.40, 0.18])
        if SPORT == "basketball": a["mins"] = random.choice([36, 31, 22, 11, 3])
        pool.append(a)
for a in pool:
    if a["cliffAt"] is not None: a["cliffYear"] = a["cliffAt"] - (0 - a["born"])

prof = profile_for(SPORT)
rows = []; moves = 0; retired = 0; debuts = 0
for year in range(YEARS):
    for a in pool:
        a["cliffYear"] = (a["cliffAt"] - (-a["born"])) if a["cliffAt"] is not None else 10 ** 9
    for a in pool:
        age = year - a["born"]
        rng = random.Random(a["id"] * 7919 + SEED * 131 + year)
        s = play_season(a, age, year, rng, prof)
        rows.append(dict(id=a["id"], year=year, age=age, team=a["team"],
                         ageless=a["ageless"], fall=round(a["fall"], 5),
                         cliff=(a["cliffAt"] if a["cliffAt"] is not None else None),
                         cliffHit=(a["cliffAt"] is not None and age >= a["cliffAt"]),
                         seasons=a["seasons"], **{k: round(v, 6) for k, v in s.items()}))
        a["seasons"] += 1
        a["lastLevel"] = s["level"]
    # ---- offseason: who is kept is RELATIVE, which is what makes careers short ----
    # An absolute replacement level produced a league where the median career was twelve
    # seasons.  Real turnover is a fifth to a third of every roster a year, and the reason is
    # that a job is taken from you by somebody else rather than lost when you cross a line.
    # So: rank the league, cut the bottom slice, and let age press on the ranking rather than
    # decide it on its own.
    ranked = sorted(pool, key=lambda a: a["lastLevel"] + (0.012 * max(0, 30 - (year - a["born"]))))
    cut_n = int(CUT_SHARE * len(pool))
    cut = set(id(a) for a in ranked[:cut_n])
    survivors = []
    for a in pool:
        age = year - a["born"]
        gone = (id(a) in cut) or age > 43 or (age > 35 and random.random() < 0.22)
        if gone: retired += 1
        else: survivors.append(a)
    for a in survivors:
        if random.random() < 0.11:                       # a trade or a free agent move
            new = random.choice([t for t in teams if t != a["team"]])
            a["team"] = new; moves += 1
    by_team = defaultdict(int)
    for a in survivors: by_team[a["team"]] += 1
    for t in teams:
        while by_team[t] < CFG["roster"]:
            nid += 1; n = new_athlete(nid, year + 1); n["team"] = t
            if SPORT == "football": n["snap"] = random.choice([1.0, 0.72, 0.40, 0.18])
            if SPORT == "basketball": n["mins"] = random.choice([36, 31, 22, 11, 3])
            n["cliffYear"] = (n["cliffAt"] - (-n["born"])) if n["cliffAt"] is not None else 10 ** 9
            survivors.append(n); by_team[t] += 1; debuts += 1
    pool = survivors

json.dump(dict(rows=rows, sport=SPORT, years=YEARS, cfg=CFG, tunables=T),
          open(f"career_{SPORT}_{SEED}.json", "w"))
ages = [r["age"] for r in rows]
ag = [r for r in rows if r["ageless"]]
print(f"{SPORT} seed {SEED} | {YEARS} seasons | {CFG['teams']} teams x {CFG['roster']} | "
      f"{len(rows)} athlete-seasons | {nid} careers")
print(f"  ages {min(ages)}-{max(ages)} (median {st.median(ages):.0f}) | trades {moves} | "
      f"retirements {retired} | debuts {debuts}")
print(f"  ageless {len(set(r['id'] for r in ag))} careers ({100*len(ag)/len(rows):.1f}% of seasons) | "
      f"cliffs {len(set(r['id'] for r in rows if r['cliff'] is not None))}")
car = defaultdict(int)
for r in rows: car[r["id"]] += 1
print(f"  career length: median {st.median(list(car.values())):.0f} seasons, "
      f"longest {max(car.values())}, {sum(1 for v in car.values() if v>=10)} reached 10+")
