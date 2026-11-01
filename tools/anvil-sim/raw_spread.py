import json, statistics as st
from collections import defaultdict
def spread(path, days, W=45):
    D=json.load(open(path)); by=defaultdict(list)
    for r in D["rows"]: by[r["id"]].append(r)
    af,at=int(days*0.08),int(days*0.32); d=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if af<=r["doy"]<at]
        if len(anc)<max(15,0.5*(at-af)): continue
        last=max(r["doy"] for r in rs)
        win=[r["v"] for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        d.append(st.mean(win)-st.mean(anc))
    m=st.median(d); mad=st.median([abs(x-m) for x in d])
    return mad/0.6745/0.0115, m/0.0115
for lbl,fs,dd in (("football",[f"fb_{s}.json" for s in (1125,2026,4419,7731)],159),
                  ("baseball",[f"mlb2_{s}.json" for s in (2702,3813,4924,6035)],248)):
    r=[spread(f,dd) for f in fs]
    print(f"  {lbl:<10} raw drift spread {st.mean([x[0] for x in r]):.2f} swings   "
          f"team median drift {st.mean([x[1] for x in r]):+.2f} swings")
