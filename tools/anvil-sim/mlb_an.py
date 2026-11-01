import json, statistics as st
from collections import defaultdict
SEEDS=[2702,3813,4924,6035]
def score(rows, N=20, MIN=10):
    by=defaultdict(list)
    for r in rows: by[r["id"]].append(r)
    for i,rs in by.items():
        for k,r in enumerate(rs):
            prev=rs[max(0,k-N):k]
            if len(prev)<MIN: r["z"]=None; continue
            v=[h["v"] for h in prev]; m,s=st.mean(v),st.pstdev(v)
            r["z"]=(r["v"]-m)/s if s>0 else 0.0
    return by

print("=== 1. DOES A ROLLING BASELINE SEE A SLOW DECLINE? ===")
agg=defaultdict(list)
for sd in SEEDS:
    D=json.load(open(f"mlb_{sd}.json")); by=score(D["rows"])
    kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
    for i,rs in by.items():
        inseason=[r for r in rs if r["doy"]>=45 and r["z"] is not None]
        if not inseason: continue
        fl=sum(1 for r in inseason if r["z"]>=2.0)
        agg[kind[i]].append(100*fl/len(inseason))
for k in ("fast","slow","none"):
    v=agg[k]; print(f"  {k:<5} decliners: {st.mean(v):5.2f}% of days flagged   (n={len(v)} athlete-seasons)")
print("  -> a FAST decline should flag more than none. A SLOW one is the question.")

print("\n=== 2. WHAT THE RAW NUMBER ACTUALLY DID, vs WHAT THE BASELINE SAW ===")
D=json.load(open("mlb_2702.json")); by=score(D["rows"])
kind={a["id"]:a.get("decline",{}).get("kind","none") for a in D["roster"]}
for k in ("slow","fast"):
    ids=[i for i,v in kind.items() if v==k][:3]
    for i in ids:
        rs=[r for r in by[i] if r["z"] is not None]
        early=[r["v"] for r in rs if 45<=r["doy"]<80]; late=[r["v"] for r in rs if r["doy"]>200]
        if not early or not late: continue
        drift=100*(st.mean(late)/st.mean(early)-1)
        fl=sum(1 for r in rs if r["doy"]>=45 and r["z"]>=2.0)
        print(f"  {k:<5} {D['roster'][i-1]['name']:<7} raw drift early->late {drift:+5.1f}%   "
              f"flagged days {fl:3d}")

print("\n=== 3. ROLE: does the baseline cope with a five day rotation? ===")
for sd in SEEDS[:1]:
    D=json.load(open(f"mlb_{sd}.json")); by=score(D["rows"])
    tag={a["id"]:a["tag"] for a in D["roster"]}
    g=defaultdict(lambda:[0,0,[]])
    for i,rs in by.items():
        for r in rs:
            if r["doy"]<45 or r["z"] is None: continue
            g[tag[i]][1]+=1; g[tag[i]][2].append(r["z"])
            if r["z"]>=2.0: g[tag[i]][0]+=1
    for t in ("SP","RP","C","IF","OF","UT","AAA"):
        f,n,zs=g[t]
        print(f"  {t:<4} {100*f/max(n,1):5.2f}% flagged   baseline spread of z {st.pstdev(zs):.2f}")

print("\n=== 4. SEASON LENGTH: flag rate by month ===")
m=defaultdict(lambda:[0,0])
for sd in SEEDS:
    D=json.load(open(f"mlb_{sd}.json")); by=score(D["rows"])
    for i,rs in by.items():
        for r in rs:
            if r["z"] is None: continue
            mo=r["date"][:7]; m[mo][1]+=1
            if r["z"]>=2.0: m[mo][0]+=1
for mo in sorted(m):
    f,n=m[mo]; print(f"  {mo}  {100*f/max(n,1):5.2f}%  ({n:5d} athlete-days)")
