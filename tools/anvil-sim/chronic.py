"""FIX 2: the chronic channel is a TREND against a FIXED anchor, and it publishes its limit.

Two things measured here, in order:
  A. the prediction that justifies the whole fix -- adding two slow channels must NOT move the
     acute flag rate, because a rolling 20-capture baseline absorbs anything slower than ~20
     days.  If it moves, the claim "the rolling baseline is blind to slow decline" is wrong.
  B. the chronic detector itself, against the three-state world, with its false positive rate
     beside every detection rate.  Two estimator forms are measured rather than asserted.
"""
import json, math, statistics as st
from collections import defaultdict
SEEDS=[2702,3813,4924,6035]

# ---- the acute channel, exactly as it ships today: rolling own baseline, last N captures ----
def acute_z(rows, N=20, MIN=10):
    by=defaultdict(list)
    for r in rows: by[r["id"]].append(r)
    for i,rs in by.items():
        for k,r in enumerate(rs):
            prev=rs[max(0,k-N):k]
            if len(prev)<MIN: r["z"]=None; continue
            v=[h["v"] for h in prev]; m,s=st.mean(v),st.pstdev(v)
            r["z"]=(r["v"]-m)/s if s>0 else 0.0
    return by

# ---- the chronic channel: a FIXED anchor from the athlete's own first 60 scoreable days ----
ANCHOR_FROM, ANCHOR_TO = 20, 80          # camp + the first weeks: before any season effect
def chronic_channel(rs, W=60, form="means"):
    """Returns (statistic, n_anchor, n_window) or None when the athlete has not got the days.
    Positive statistic = slower than their own anchor = declined."""
    anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
    if len(anc)<30: return None
    last=max(r["doy"] for r in rs)
    win=[(r["doy"],r["v"]) for r in rs if r["doy"]>last-W]
    if len(win)<W*0.7: return None
    am, asd = st.mean(anc), st.pstdev(anc)
    if asd<=0: return None
    if form=="means":
        # difference of window mean from anchor mean, in standard errors of the window mean
        wm=st.mean([v for _,v in win])
        return ((am-wm)/(asd/math.sqrt(len(win))), len(anc), len(win))
    # form=="slope": local regression slope over the window, in SE of the slope
    xs=[d for d,_ in win]; ys=[v for _,v in win]
    mx,my=st.mean(xs),st.mean(ys)
    sxx=sum((x-mx)**2 for x in xs)
    b=sum((x-mx)*(y-my) for x,y in zip(xs,ys))/sxx
    resid=[y-(my+b*(x-mx)) for x,y in zip(xs,ys)]
    se=math.sqrt(sum(r*r for r in resid)/(len(xs)-2)/sxx)
    return (-b/se, len(anc), len(win))     # negative slope = declining = positive statistic

print("=== A. DOES ADDING THE SLOW CHANNELS MOVE THE ACUTE ONE? ===")
print("   (the prediction: no, because the rolling baseline absorbs anything slower than ~20d)")
for tag,fn in (("one-pool world  (mlb_)","mlb_%d.json"),("three-state world (mlb2_)","mlb2_%d.json")):
    agg=defaultdict(list); spread=[]
    for sd in SEEDS:
        D=json.load(open(fn%sd)); by=acute_z(D["rows"])
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        for i,rs in by.items():
            ins=[r for r in rs if r["doy"]>=45 and r["z"] is not None]
            if not ins: continue
            agg[kind[i]].append(100*sum(1 for r in ins if r["z"]>=2.0)/len(ins))
            spread += [r["z"] for r in ins]
    print(f"   {tag:<26} fast {st.mean(agg['fast']):4.2f}%  slow {st.mean(agg['slow']):4.2f}%  "
          f"none {st.mean(agg['none']):4.2f}%   z sd {st.pstdev(spread):.2f}")

print("\n=== B. THE CHRONIC CHANNEL, 60 DAY WINDOW, BOTH ESTIMATOR FORMS ===")
for form in ("means","slope"):
    res=defaultdict(list)
    for sd in SEEDS:
        D=json.load(open(f"mlb2_{sd}.json"))
        by=defaultdict(list)
        for r in D["rows"]: by[r["id"]].append(r)
        kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
        for i,rs in by.items():
            c=chronic_channel(rs, 60, form)
            if c: res[kind[i]].append(c[0])
    # a threshold is only meaningful beside the clean group it is calibrated on
    clean=sorted(res["none"]); thr=clean[int(0.90*len(clean))]      # 10% false positive by design
    print(f"\n   form={form:<6}  threshold set at the clean group's 90th centile = {thr:+.2f}")
    for k in ("slow","fast","none"):
        v=res[k]
        hit=100*sum(1 for x in v if x>=thr)/len(v)
        print(f"     {k:<5} n={len(v):3d}  median statistic {st.median(v):+7.2f}   "
              f"flagged {hit:5.1f}%")
