"""The chronic channel, with the sign the right way round and the roster term put back.

chronic.py had the sign inverted (fatigue RAISES this metric, as the acute channel already
assumes) and, once corrected, showed the real problem: by October EVERY athlete is worse than
their own camp anchor, because wear is universal.  A fixed anchor measures the season, not the
athlete.

So the roster term is back -- and this CORRECTS the earlier rejection of de-trending.  It did
nothing against the one-pool world because there was no universal drift there to remove.  In a
world with a wear state there is one, and removing it is what the chronic channel needs.
"""
import json, math, statistics as st
from collections import defaultdict
SEEDS=[2702,3813,4924,6035]
ANCHOR_FROM, ANCHOR_TO = 20, 80

def load(sd):
    D=json.load(open(f"mlb2_{sd}.json"))
    by=defaultdict(list)
    for r in D["rows"]: by[r["id"]].append(r)
    kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
    return D,by,kind

def roster_drift(by):
    """The team's own median shift per day, relative to each athlete's anchor.  This is the
    SEASON, measured on the people in it, so it needs no outside norm and no cohort floor."""
    anc={}
    for i,rs in by.items():
        a=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
        if len(a)>=30: anc[i]=st.mean(a)
    perday=defaultdict(list)
    for i,rs in by.items():
        if i not in anc: continue
        for r in rs: perday[r["doy"]].append(r["v"]-anc[i])
    return {d: st.median(v) for d,v in perday.items() if len(v)>=20}, anc

def statistic(rs, anc_m, anc_sd, W, drift=None):
    last=max(r["doy"] for r in rs)
    win=[r for r in rs if r["doy"]>last-W]
    if len(win)<W*0.7 or anc_sd<=0: return None
    vals=[r["v"]-(drift.get(r["doy"],0.0) if drift else 0.0) for r in win]
    wm=st.mean(vals)
    return (wm-anc_m)/(anc_sd/math.sqrt(len(vals)))      # positive = slower = declined

def run(W, detrend):
    res=defaultdict(list)
    for sd in SEEDS:
        D,by,kind=load(sd)
        drift,anc=roster_drift(by)
        for i,rs in by.items():
            if i not in anc: continue
            a=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
            s=statistic(rs, anc[i], st.pstdev(a), W, drift if detrend else None)
            if s is not None: res[kind[i]].append(s)
    clean=sorted(res["none"]); thr=clean[int(0.90*len(clean))]
    out={}
    for k in ("slow","fast","none"):
        v=res[k]; out[k]=(100*sum(1 for x in v if x>=thr)/len(v), st.median(v), len(v))
    return thr,out

print("  A fixed anchor, 60 day end window.  The threshold is the clean group's 90th centile")
print("  every time, so the false positive rate is held at 10% and only DETECTION moves.\n")
print(f"  {'':<26}{'slow caught':>13}{'fast caught':>13}{'false +':>10}{'clean median':>15}")
print("  "+"-"*77)
for dt_ in (False,True):
    thr,o=run(60,dt_)
    lbl="raw (anchor only)" if not dt_ else "roster de-trended"
    print(f"  {lbl:<26}{o['slow'][0]:>12.1f}%{o['fast'][0]:>12.1f}%{o['none'][0]:>9.1f}%"
          f"{o['none'][1]:>15.2f}")

print("\n  Window sweep, roster de-trended, false positives held at 10% throughout:\n")
print(f"  {'window (days)':<16}{'slow caught':>13}{'fast caught':>13}{'threshold':>12}")
print("  "+"-"*54)
for W in (21,30,45,60,90,120):
    thr,o=run(W,True)
    print(f"  {W:<16}{o['slow'][0]:>12.1f}%{o['fast'][0]:>12.1f}%{thr:>12.2f}")
