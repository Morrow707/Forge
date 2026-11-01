# Anvil simulation harness

Test worlds for the Anvil neuro-fatigue check-in, and the detectors measured against them.
Nothing here is shipped code: it is the evidence behind the design decisions in the Anvil
artifact, kept so that nobody has to rebuild a world to re-ask a question.

```
./build.sh     # regenerate every world from its seeds (~2 min)
./run.sh       # every analysis, in the order the findings were made
```

The generated worlds are **not committed** (~30MB) and are **deterministic**: the seeds are in
the scripts, so `build.sh` reproduces them byte for byte. `.gitignore` covers `*.json` here.

## The three worlds

| | football | baseball | basketball |
|---|---|---|---|
| roster | 125 | 40 | 18 |
| season | 159 days | 248 days | 273 days |
| games | 17 | 184 | 112 |
| shape | one spike a week | one every day | clustered, irregular |
| what is special | injuries, rehab, depth chart | role divergence, no off days | load management, bimodal minutes |
| seasons generated | 4 | 4 | **40** |
| taus | fitted | fitted | **defaulted** |

Basketball runs 40 seasons because an 18-man roster yields 2 slow decliners a season: at 4 seeds
the detection rate reads 4.2%, which is **one athlete out of 24**, not a measurement. It settles
at 23.8% with 40. *A small roster needs an order of magnitude more seasons to say anything.*

## What each file is

**Worlds**
- `tau.py` — the per-sport constant lookup. Fresh record per call, a `sources` map marking each
  number shared or fitted, evidence required for every fitted value, and a sport nobody measured
  is **marked defaulted** rather than silently handed another sport's numbers.
- `mlb.py` — baseball on the original **one-pool** model. Kept only as the control that shows the
  acute channel did not move when the slow channels were added.
- `mlb2.py` / `sim125b.py` / `nba.py` — the three worlds on the three-state model.
- `sim125.py` — the original one-pool football sim, kept for the same reason as `mlb.py`.

**Findings**
- `plateau.py` — why "two states" was the wrong answer.
- `chronic.py` → `chronic2.py` → `chronic3.py` → `chronic4.py` — the detector's four forms in the
  order they were tried and discarded. Kept in sequence because three of them failed for reasons
  worth not repeating.
- `chronic_limit.py` — the published floor, validated against the real runs.
- `resolution.py` — the two channels expressed in one unit.
- `compare.py` — **the three worlds through one detector.**
- `why_r2.py` — why the athlete's own load explains one world and not another.
- `form_by_sport.py` — and therefore why the detector form is chosen per roster.
- `raw_spread.py` — the anchor means opposite things in football and baseball.
- `diag3.py`, `limit.py`, `mlb_an.py`, `an125.py` — earlier diagnostics, superseded but kept.

## The findings, so they do not have to be re-derived

**Three fatigue states, not two.** An exponential pool is at 95% of its ceiling after 3τ, so
nothing under τ≈83 days is still rising in September of a 248-day season. Measured on one
catcher's real load: τ28 moves −1.2% June→September (flat), τ120 moves +35.8% and peaks on the
last day. So: acute 3.5d (yesterday), chronic 28d (the month — it plateaus by June and that is
correct), wear 120d (the season).

**Adding the slow channels did not move the acute one**, which is the premise the whole design
rests on: a rolling 20-capture baseline absorbs anything slower than ~20 days. Measured
4.08%→4.43% / 4.23%→4.59% / 3.78%→3.84%, z-spread 1.15 in both worlds.

**The chronic channel's floor, validated** (model predicts 29%, real detector caught 30%). A
*swing* is one day-to-day SD of the metric:

| channel | 50% of declines caught | 80% caught |
|---|---|---|
| acute — one day vs a rolling baseline | 1.93 swings | 2.82 swings |
| chronic — 45 days vs a fixed anchor | 0.37 swings | 0.61 swings |

The chronic channel resolves **5.3× finer** than the daily flag. It is not a weaker instrument,
it is a slower one. Neither can see the other's signal, which is the argument for two channels
rather than one threshold.

**The detector form is sport-shaped, and the selector is measurable rather than fitted.**

| world | load spread across the roster | better form | residual σ | 50% floor |
|---|---|---|---|---|
| football | **18%** of its mean | roster median only | 0.33 sw | 0.42 sw |
| baseball | **39%** | regress on the athlete's own load | 0.29 sw | 0.37 sw |
| basketball | **40%** | regress on the athlete's own load | 0.34 sw | 0.44 sw |

Everyone on a football team does the same Tuesday practice; only game snaps differ, and games are
one day in seven. Among never-injured football athletes the load regression explains **R² 0.02** —
there is nothing to explain. In baseball and basketball the load *is* the role. So the form is
chosen per roster from the measured residual spread, which needs no threshold and no sport label.

**The anchor means opposite things in different sports.** Football's roster median season drift is
**−0.45 swings** (everyone improves relative to camp, because camp is the hardest block of the
year); baseball's is **+0.40** (everyone declines, because camp is the easiest). A fixed anchor
measures *recovery from camp* in one sport and *accumulation of season* in the other.

**Role heterogeneity needs no tuning on the acute channel and dominates the chronic one.** Rolling
own baselines normalise role away (z-spread 1.11–1.17 across every role in every sport); a fixed
anchor normalises nothing. Baseball season drift by role: C/IF/UT +0.0111 to +0.0119, SP/RP
+0.0005, AAA shuttle −0.0036 — a spread of 0.015 against an injected decline of 0.0022. Scoring
within role is not available (3 catchers, 2 utility men), so role is modelled out instead.

**Tested and rejected.** A longer window: detection peaks at 45 days in all three worlds and does
not improve past it while the threshold climbs. De-trending by the roster's own seasonal curve was
rejected on the one-pool world and **that rejection was wrong** — there was no universal drift in
that world to remove. It is the winning form in football.

## Two errors in here worth not repeating

- The chronic statistic's **sign was inverted** in the first pass. Fatigue *raises* this metric, as
  the acute channel already assumes, so the decliners read as the healthiest men on the roster.
- The first two detector forms divided by **within-athlete noise**, so the clean group's statistic
  had a spread of 2.8 rather than 1.0 and the threshold had to be inflated to compensate, which
  threw the detection away.
