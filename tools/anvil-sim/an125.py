import json, datetime as dt, statistics as st
from collections import defaultdict
SEEDS=[1125,2026,7731,4419]
IN="2026-08-24"
def load(s): return json.load(open(f"out125_{s}.json"))

print("=== 1. WHAT A COACH SEES EACH MORNING (threshold sweep, per season) ===")
print(f"  {'thr':>4} " + " ".join(f"{s:>12}" for s in SEEDS) + "   mean names/day")
for thr in (1.5,2.0,2.5,3.0):
    cells=[]; allv=[]
    for s in SEEDS:
        D=load(s); perday=defaultdict(set); days=set()
        for r in D["rows"]:
            if r["date"]<IN: continue
            days.add(r["date"])
            if (r.get("drive_z") or -9)>=thr or (r.get("head_z") or -9)>=thr: perday[r["date"]].add(r["id"])
        v=[len(perday[d]) for d in days]; cells.append(st.mean(v)); allv+=v
    print(f"  {thr:>4} " + " ".join(f"{c:>12.1f}" for c in cells) + f"   {st.mean(allv):>6.1f} of 125")

print("\n=== 2. IS IT THE SAME NAMES, OR NOISE? (2.0 sigma) ===")
for s in SEEDS:
    D=load(s); by=defaultdict(list)
    for r in D["rows"]:
        if r["date"]>=IN: by[r["id"]].append(r)
    flagged=defaultdict(int); runs=[]
    for i,rs in by.items():
        seq=[1 if ((r.get("drive_z") or -9)>=2 or (r.get("head_z") or -9)>=2) else 0 for r in rs]
        n=sum(seq); flagged[i]=n
        c=0
        for v in seq:
            if v: c+=1
            elif c: runs.append(c); c=0
        if c: runs.append(c)
    ever=sum(1 for v in flagged.values() if v)
    top=sorted(flagged.values(),reverse=True)
    share=100*sum(top[:20])/max(sum(top),1)
    print(f"  seed {s}: {ever:3d} of 125 flagged at least once | top 20 athletes hold {share:.0f}% of all flags"
          f" | mean consecutive run {st.mean(runs):.2f} days, longest {max(runs)}")

print("\n=== 3. REHAB: does a season-ending injury flag forever, or never? ===")
for s in SEEDS[:2]:
    D=load(s)
    rows=[r for r in D["rows"] if r["date"]>=IN]
    for stt in ("ok","rehab"):
        sub=[r for r in rows if r["st"]==stt and r.get("drive_z") is not None]
        if not sub: continue
        f=sum(1 for r in sub if (r.get("drive_z") or -9)>=2 or (r.get("head_z") or -9)>=2)
        blind=sum(1 for r in rows if r["st"]==stt and r.get("drive_z") is None)
        print(f"  seed {s} {stt:6s}: {len(sub):5d} scoreable, {f:3d} flagged ({100*f/len(sub):4.1f}%), {blind:3d} blind")

print("\n=== 4. IS THE FLAG MEASURING POSITION OR FATIGUE? (2.0 sigma, pooled 4 seasons) ===")
pos=defaultdict(lambda:[0,0]); tier=defaultdict(lambda:[0,0])
for s in SEEDS:
    for r in load(s)["rows"]:
        if r["date"]<IN or r.get("drive_z") is None: continue
        f=1 if ((r.get("drive_z") or -9)>=2 or (r.get("head_z") or -9)>=2) else 0
        pos[r["pos"]][0]+=f; pos[r["pos"]][1]+=1
        tier[r["tier"]][0]+=f; tier[r["tier"]][1]+=1
for k in sorted(pos,key=lambda x:-pos[x][0]/pos[x][1]):
    f,t=pos[k]; print(f"   {k:3s} {100*f/t:5.2f}%  ({f} of {t})")
print()
for k in ("starter","rotation","reserve","scout"):
    f,t=tier[k]; print(f"   {k:9s} {100*f/t:5.2f}%  ({f} of {t})")

print("\n=== 5. BLIND DAYS AND STALE BASELINES ACROSS ALL FOUR ===")
for s in SEEDS:
    D=load(s); rows=[r for r in D["rows"] if r["date"]>=IN]
    blind=sum(1 for r in rows if r.get("drive_z") is None)
    stale=sum(1 for r in rows if r.get("age",0)>35)
    print(f"  seed {s}: {blind:4d} blind of {len(rows)} ({100*blind/len(rows):.1f}%) | "
          f"{stale:4d} days on a baseline older than 35 days ({100*stale/len(rows):.1f}%)")
