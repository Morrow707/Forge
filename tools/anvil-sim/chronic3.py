"""The chronic channel, third form -- and this one is the keeper.

Why the first two forms were weak: both divided by the WITHIN-athlete noise (the anchor's own
standard error), and the clean group's statistic then had a spread of 2.8, not 1.0.  That factor
is real: it is the between-athlete spread of season drifts -- role, load, age, how much work each
man actually did.  A denominator that ignores it understates the uncertainty of every athlete's
window mean by the same 2.8, and the threshold has to be inflated to compensate, which is what
threw the detection away.

So the denominator comes from the ROSTER: how far has this athlete drifted, in units of how much
the roster's drifts vary.  Same shape as the strength percentile, and it needs no SE assumption.
Two consequences, both stated on the screen rather than buried:
  - it is RELATIVE.  A team that is uniformly cooked flags nobody, correctly, and the team's own
    absolute drift is reported separately as a TEAM number.
  - it needs a cohort.  Under the floor there is no number, exactly as NORM_MIN_COHORT already
    decides for the strength percentile.
"""
import json, math, statistics as st
from collections import defaultdict
SEEDS=[2702,3813,4924,6035]
ANCHOR_FROM, ANCHOR_TO = 20, 80
MIN_COHORT = 12          # under this there is no chronic number at all

def shifts(by, W):
    """(athlete -> season drift) plus the roster's own median and spread of those drifts."""
    out={}
    for i,rs in by.items():
        anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
        if len(anc)<30: continue
        last=max(r["doy"] for r in rs)
        win=[r["v"] for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        out[i]=st.mean(win)-st.mean(anc)
    if len(out)<MIN_COHORT: return None
    vals=list(out.values()); med=st.median(vals)
    # median absolute deviation -> sigma, so one cooked athlete cannot set the roster's spread
    mad=st.median([abs(v-med) for v in vals])
    sd=mad/0.6745 if mad>0 else st.pstdev(vals)
    return out, med, sd

def run(W, thr_centile=0.90):
    res=defaultdict(list); teamdrift=[]
    for sd_ in SEEDS:
        D=json.load(open(f"mlb2_{sd_}.json"))
        by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        s=shifts(by,W)
        if s is None: continue
        drift,med,sd=s
        teamdrift.append(med)
        for i,d in drift.items(): res[kind[i]].append((d-med)/sd)
    clean=sorted(res["none"]); thr=clean[int(thr_centile*len(clean))]
    out={k:(100*sum(1 for x in res[k] if x>=thr)/len(res[k]), st.median(res[k]), len(res[k]))
         for k in ("slow","fast","none")}
    return thr,out,st.mean(teamdrift)

print("  Roster-relative season drift, threshold = the clean group's 90th centile every time,")
print("  so the false positive rate is pinned at 10% and only DETECTION moves.\n")
print(f"  {'window':<10}{'slow caught':>13}{'fast caught':>13}{'false +':>10}{'threshold':>12}")
print("  "+"-"*58)
best=None
for W in (21,30,45,60,90):
    thr,o,td=run(W)
    print(f"  {W:<10}{o['slow'][0]:>12.1f}%{o['fast'][0]:>12.1f}%{o['none'][0]:>9.1f}%{thr:>12.2f}")
    if best is None or o['slow'][0]+o['fast'][0] > best[1]: best=(W,o['slow'][0]+o['fast'][0])
W=best[0]
print(f"\n  Best window: {W} days.  Trading the threshold instead, at that window:\n")
print(f"  {'threshold':<12}{'slow caught':>13}{'fast caught':>13}{'false +':>10}")
print("  "+"-"*48)
for c in (0.999,0.98,0.95,0.90,0.80,0.70):
    thr,o,td=run(W,c)
    print(f"  {thr:<12.2f}{o['slow'][0]:>12.1f}%{o['fast'][0]:>12.1f}%{o['none'][0]:>9.1f}%")
thr,o,td=run(W)
print(f"\n  The team number, reported separately: the roster's own median drift over the season")
print(f"  is {td:+.5f} in metric units -- about {abs(td)/0.0115:.1f} day-to-day noise SD, i.e. the")
print(f"  whole roster really is slower in October than in camp, and no athlete is flagged for it.")
