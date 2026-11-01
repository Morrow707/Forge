"""THE BETTER TEST: informative missingness, and whether three sensors beat one.

Everything up to here assumed 100% compliance and a single sensor. Both are science fiction:

  - Highmark measured 5% of students finishing fifteen days IN A SUPERVISED CLASSROOM, and 73%
    managing ten. The Grain run put compliance at 78% falling to 43% at scale.
  - And missingness is NOT RANDOM. People skip a check-in when they are busy, when they feel
    awful, when they have stopped caring, and when they are away. An own-baseline z computed on
    the days somebody chose to show up is a biased estimate of the days they did not.
  - Forge's whole architectural claim is THREE sensors under one arbiter, and that claim has
    never been tested. A second noisy sensor can just as easily add noise as remove it.

So: three sensors with different noise, different availability and different reasons to be
missing, under four compliance regimes, measured on the same athletes.
"""
import math, random, statistics as st
from statistics import NormalDist
from collections import defaultdict

DAYS=248; N=400; FAT=0.0022
# three sensors: their own noise, and when they are even POSSIBLE
SENSORS={
  # name          noise   available on                                    what it is
  "temper":   dict(sd=0.0115, on=lambda d,tr: True),                # a tap check, any day
  "velloss":  dict(sd=0.0160, on=lambda d,tr: tr=="lift"),          # needs a barbell set
  "rsi":      dict(sd=0.0190, on=lambda d,tr: tr in ("lift","plyo")),# needs a jump
  "auto":     dict(sd=0.0135, on=lambda d,tr: True),                # a wearable, any night
}

def day_type(rng):
    r=rng.random()
    return "lift" if r<0.42 else ("plyo" if r<0.55 else ("game" if r<0.72 else "rest"))

def run(regime, sensors, n=N, seed=0):
    """Returns (detection of a real decline, false positive rate) for the ACUTE channel at z>=2
    and the CHRONIC channel at its own 90th-centile threshold."""
    rng=random.Random(seed)
    acute_hits=defaultdict(list); drift=[]
    for a in range(n):
        decline = (a % 4 == 0)                      # a quarter of them really decline
        size = rng.uniform(0.8,1.6)*FAT if decline else 0.0
        has_wearable = rng.random() < 0.45          # fewer than half own one
        series=defaultdict(list); anc=defaultdict(list)
        # a personal compliance level, and a personal decay
        base_p = {"perfect":1.0,"flat":0.72,"decaying":0.92,"informative":0.92}[regime]
        for d in range(DAYS):
            tr=day_type(rng)
            true = size*max(0.0,min(1.0,(d-30)/190.0))
            # --- does this athlete check in today? ---
            p=base_p
            if regime=="decaying":    p=base_p*math.exp(-d/320.0)
            if regime=="informative":
                p=base_p*math.exp(-d/320.0)
                # the tell: a bad day is a day you are LESS likely to log
                p *= 1.0 - 0.45*min(1.0, true/(2.0*FAT))
                if tr=="game": p*=0.55            # travel, late finish
            checked = regime=="perfect" or rng.random()<p
            for s in sensors:
                if not SENSORS[s]["on"](d,tr): continue
                if s=="auto" and not has_wearable: continue
                if s!="auto" and not checked: continue      # a sensor needs the athlete present
                v = true + rng.gauss(0,SENSORS[s]["sd"])
                series[s].append((d,v))
                if 20<=d<80: anc[s].append(v)
        # --- acute: rolling 20, flag at z>=2, corroboration = 2 of the available sensors ---
        flags=0; opp=0
        per=defaultdict(list)
        for s in sensors: per[s]=series[s]
        idx={s:0 for s in sensors}
        allday=sorted({d for s in sensors for d,_ in series[s]})
        hist=defaultdict(list)
        for d in allday:
            votes=0; avail=0
            for s in sensors:
                pts=[v for dd,v in series[s] if dd==d]
                if not pts: continue
                avail+=1
                h=hist[s]
                if len(h)>=10:
                    m=st.mean(h[-20:]); sd=st.pstdev(h[-20:])
                    if sd>0 and (pts[0]-m)/sd>=2.0: votes+=1
                hist[s].append(pts[0])
            if avail==0: continue
            opp+=1
            need = 2 if (len(sensors)>1 and avail>=2) else 1
            if votes>=need: flags+=1
        acute_hits["dec" if decline else "clean"].append(100*flags/max(opp,1))
        # --- chronic: fixed anchor vs a 45 day end window, pooled across available sensors ---
        ds=[]
        for s in sensors:
            if len(anc[s])<15: continue
            win=[v for dd,v in series[s] if dd>DAYS-45]
            if len(win)<12: continue
            ds.append((st.mean(win)-st.mean(anc[s]))/SENSORS[s]["sd"])
        if ds: drift.append((decline, st.mean(ds)))
    cl=sorted(x for dec,x in drift if not dec)
    thr=cl[int(0.90*len(cl))] if cl else 0
    cdet=100*sum(1 for dec,x in drift if dec and x>=thr)/max(sum(1 for dec,_ in drift if dec),1)
    return (st.mean(acute_hits["dec"]), st.mean(acute_hits["clean"]), cdet,
            100*len(drift)/n)

print("  FOUR COMPLIANCE REGIMES, ONE SENSOR vs THREE\n")
print(f"  {'regime':<14}{'sensors':<10}{'acute: declining':>18}{'acute: clean':>14}"
      f"{'chronic caught':>19}{'scoreable':>9}")
print("  "+"-"*83)
LAB={"perfect":"perfect","flat":"flat 72%","decaying":"decaying","informative":"INFORMATIVE"}
import statistics as _st
for regime in ("perfect","flat","decaying","informative"):
    for sens,lbl in ((["temper"],"temper"),(["temper","velloss","rsi","auto"],"all four")):
        R=[run(regime, sens, seed=k*131+len(lbl)) for k in range(5)]   # 5 runs x 400 = 500 decliners
        d,c,ch,sc=[_st.mean(x) for x in zip(*R)]
        spread=_st.pstdev([x[2] for x in R])
        print(f"  {LAB[regime]:<14}{lbl:<10}{d:>17.2f}%{c:>13.2f}%{ch:>13.1f}% +-{spread:<4.1f}{sc:>8.0f}%")
    print()
