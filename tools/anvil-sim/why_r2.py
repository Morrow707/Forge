"""Football's load explains 0.17 of season drift where baseball's explains 0.75.  Why?"""
import json, statistics as st
from collections import defaultdict
def pts(path, days, W=45, pred="load", only=None):
    D=json.load(open(path)); by=defaultdict(list)
    for r in D["rows"]: by[r["id"]].append(r)
    af,at=int(days*0.08),int(days*0.32)
    out=[]
    for i,rs in by.items():
        anc=[r["v"] for r in rs if af<=r["doy"]<at]
        if len(anc)<max(15,0.5*(at-af)): continue
        last=max(r["doy"] for r in rs)
        win=[r for r in rs if r["doy"]>last-W]
        if len(win)<W*0.7: continue
        if only and not only(rs,win): continue
        x = st.mean([r[pred] for r in win]) if pred!="ancload" else st.mean(
            [r["load"] for r in rs if af<=r["doy"]<at])
        out.append((i, st.mean([r["v"] for r in win])-st.mean(anc), x, rs, win))
    return out
def r2(p):
    if len(p)<8: return float("nan"), len(p)
    mx=st.mean([a[2] for a in p]); my=st.mean([a[1] for a in p])
    sxx=sum((a[2]-mx)**2 for a in p)
    if sxx<=0: return float("nan"), len(p)
    b=sum((a[2]-mx)*(a[1]-my) for a in p)/sxx
    ss=sum((a[1]-my)**2 for a in p); sr=sum((a[1]-(my+b*(a[2]-mx)))**2 for a in p)
    return 1-sr/ss, len(p)
FB=[(f"fb_{s}.json",159) for s in (1125,2026,4419,7731)]
MB=[(f"mlb2_{s}.json",248) for s in (2702,3813,4924,6035)]
NB=[(f"nba_{s}.json",273) for s in range(3001,3041)]
print(f"  {'predictor of season drift':<38}{'football':>11}{'baseball':>11}{'basketball':>12}")
print("  "+"-"*72)
for pred,lbl in (("load","load in the end window"),("wear","accumulated work"),
                 ("chronic","the month behind"),("ancload","load during the ANCHOR")):
    f=st.mean([r2(pts(p,d,45,pred))[0] for p,d in FB])
    m=st.mean([r2(pts(p,d,45,pred))[0] for p,d in MB])
    n=st.mean([r2(pts(p,d,45,pred))[0] for p,d in NB])
    print(f"  {lbl:<38}{f:>11.2f}{m:>11.2f}{n:>12.2f}")
print()
# the suspicion: rehab/injury athletes break the load->drive relationship
def healthy(rs,win): return all(r.get("st","ok")=="ok" for r in rs)
f_all=st.mean([r2(pts(p,d))[0] for p,d in FB])
f_h =[r2(pts(p,d,45,"load",healthy)) for p,d in FB]
print(f"  football, every athlete                    R2 {f_all:.2f}")
print(f"  football, never injured all season         R2 "
      f"{st.mean([x[0] for x in f_h]):.2f}   (n={st.mean([x[1] for x in f_h]):.0f} of 125)")
# and the real cause: how much does load VARY between athletes in each world?
for lbl,FS in (("football",FB),("baseball",MB),("basketball",NB)):
    sp=[]
    for p,d in FS:
        q=pts(p,d); xs=[a[2] for a in q]
        sp.append(st.pstdev(xs)/st.mean(xs))
    print(f"  {lbl:<11} spread of end-window load across the roster: {st.mean(sp)*100:.0f}% of its mean")
