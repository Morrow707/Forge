import json, math, statistics as st
from collections import defaultdict
ANCHOR_FROM,ANCHOR_TO=20,80; W=45
D=json.load(open("mlb2_2702.json"))
by=defaultdict(list)
for r in D["rows"]: by[r["id"]].append(r)
info={a["id"]:a for a in D["roster"]}
rows=[]
for i,rs in by.items():
    anc=[r["v"] for r in rs if ANCHOR_FROM<=r["doy"]<ANCHOR_TO]
    last=max(r["doy"] for r in rs)
    win=[r["v"] for r in rs if r["doy"]>last-W]
    d=st.mean(win)-st.mean(anc)
    a=info[i]; dd=a.get("decline")
    rows.append((i,a["name"],a["tag"],dd["kind"] if dd else "none",
                 dd["size"] if dd else 0.0, d, st.mean([r["wear"] for r in rs if r["doy"]>last-W])))
vals=[r[5] for r in rows]; med=st.median(vals)
mad=st.median([abs(v-med) for v in vals]); sd=mad/0.6745
print(f"  roster drift: median {med:+.5f}  MAD-sigma {sd:.5f}  raw sd {st.pstdev(vals):.5f}")
print(f"  injected decline of size 1.0 moves the metric by {1.0*0.0022:.5f} = {0.0022/sd:.2f} roster-drift sigma\n")
print(f"  {'name':<8}{'tag':<5}{'kind':<6}{'size':>6}{'drift':>10}{'z':>7}{'wear':>8}")
print("  "+"-"*52)
for i,n,t,k,s,d,w in sorted(rows,key=lambda x:-x[5])[:14]:
    print(f"  {n:<8}{t:<5}{k:<6}{s:>6.2f}{d:>10.5f}{(d-med)/sd:>7.2f}{w:>8.1f}")
print("   ...")
for i,n,t,k,s,d,w in sorted(rows,key=lambda x:-x[5])[-6:]:
    print(f"  {n:<8}{t:<5}{k:<6}{s:>6.2f}{d:>10.5f}{(d-med)/sd:>7.2f}{w:>8.1f}")
# how much of the drift spread is ROLE rather than decline?
bytag=defaultdict(list)
for i,n,t,k,s,d,w in rows: bytag[t].append(d)
print("\n  drift by role (this is what the roster-relative z is competing against):")
for t in ("SP","RP","C","IF","OF","UT","AAA"):
    v=bytag[t]; print(f"    {t:<4} median {st.median(v):+.5f}  n={len(v)}")
