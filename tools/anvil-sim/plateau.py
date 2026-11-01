"""Does ANY single pool carry a season?  Drive the same real schedule through taus from 3 to 240
days and ask when each pool stops rising.  This decides whether two states is enough or whether
the season-long term is a third, different thing."""
import math, json, statistics as st
from collections import defaultdict
D=json.load(open("mlb2_2702.json"))
# one representative everyday player's real load series
rows=[r for r in D["rows"] if r["tag"]=="C" and r["id"]==min(x["id"] for x in D["roster"] if x["tag"]=="C")]
L=[r["load"] for r in rows]; N=len(L)
print(f"  {N} days of one catcher's real load (mean {st.mean(L):.0f})\n")
print(f"  {'tau (d)':>8}{'peaks on day':>14}{'% of peak by Jun 1':>21}{'Jun->Sep change':>18}")
print("  "+"-"*61)
for tau in (3.5,14,28,45,60,90,120,180,240):
    k=math.exp(-1/tau); p=0.0; s=[]
    for x in L: p=p*k+x*(1-k); s.append(p)
    pk=s.index(max(s))
    jun=[s[i] for i,r in enumerate(rows) if r["date"][:7]=="2026-06"]
    sep=[s[i] for i,r in enumerate(rows) if r["date"][:7]=="2026-09"]
    byjun=100*st.mean(jun)/max(s)
    chg=100*(st.mean(sep)/st.mean(jun)-1)
    print(f"  {tau:>8.1f}{pk:>14d}{byjun:>20.0f}%{chg:>17.1f}%")
print("""
  An exponential pool is at 95% of its ceiling after 3 tau.  A 248 day season therefore needs
  tau > ~83 days before the pool is still RISING in September -- and a pool with a tau that long
  is not recovery, it is an integrator: cumulative work, with a leak so slow it barely leaks.""")
