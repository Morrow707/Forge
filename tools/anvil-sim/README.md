# Anvil simulation harness

Test worlds for the Anvil daily check, and the detectors measured against them.
Nothing here is shipped code: it is the evidence behind the design decisions in the Anvil
artifact, kept so that nobody has to rebuild a world to re-ask a question.

```
./build.sh     # regenerate every world from its seeds (~2 min)
./run.sh       # every analysis, in the order the findings were made
```

The generated worlds are **not committed** (~30MB) and are **deterministic**: the seeds are in
the scripts, so `build.sh` reproduces them byte for byte. `.gitignore` covers `*.json` here.

## Careers, not seasons

`career.py` builds a league (6 teams, 14 seasons) with an aging curve, cliffs, trades,
retirement and replacement; `career_channel.py` is the detector. Careers come out realistic
(median 3 seasons, 17% turnover a year, longest 14) because the cut is **relative** -- the
bottom slice of the league goes every offseason -- rather than an absolute replacement level,
which produced a league where the median career was twelve seasons.

**What this model does not contain, and it decides what any number here can mean.** Brady at 43,
LeBron at 39 and Scherzer at 38 were not physiologically 26. They were better at the parts that
are not physiological: anticipation, preparation, technique, picking their spots, changing what
they do. None of that is in here. This model has a body and a schedule, so the most it can say
is *"this athlete's physical decline is slower than his age cohort's"* -- never why. A product
that forgets that will tell a 38 year old to retire.

Two further things asserted rather than established: the "ageless" class is drawn from a
**different distribution**, not the tail of the normal one (whether real outliers are a separate
population or the tail of one is unknown, and it matters -- if they are the tail, the channel's
sparing of them is partly luck); and the cliff is a **step with no precursor**, which is why
section 6 below finds nothing before it.

### What the career run found

**A career anchor is a machine for telling a 35 year old he is not 23.** Flagging anyone a swing
slower than their own rookie season, among athletes with no cliff at all, aging exactly as
expected: 0% at 23, 13% at 29, 35% at 32, **54% at 35** (baseball).

**Year over year against the same-age cohort works**, and three of its properties are the design
rather than luck:

| at a 10% false positive rate | football | baseball | basketball |
|---|---|---|---|
| ordinary season, no cliff | 10.0% | 10.0% | 10.0% |
| the year a cliff lands | **84.4%** | **50.0%** | **51.9%** |
| the ageless | **7.4%** | **2.6%** | **7.6%** |
| the season after a trade | 10.2% | 10.6% | 10.3% |
| aged 35+, no cliff | — | 12.2% | — |
| after a season of *gains* | 6.1% | 3.3% | 4.3% |

The ageless score **below** the base rate, by construction: an athlete declining slower than his
cohort scores better than average, which is what the Brady/LeBron/Scherzer case needs. Trades are
**exactly** neutral, because the statistic is within-athlete year over year scored against a
league-wide age cohort rather than a roster -- the career channel is immune to the thing that
breaks the chronic channel.

**It cannot see a cliff coming.** Flag rate in the three seasons before one lands: 0% to 6.7%,
**below** the 10% base rate, in every sport. The channel is purely retrospective: it confirms,
it does not predict. Part of that is the model (a step with no precursor cannot be anticipated by
anything), and the part that is not is the finding: **this must never be sold as predictive.**

**Two seasons is the budget.** Caught that season / by the end of the next / within three:
football 84/93/93, baseball 50/70/70, basketball 52/74/74. A third season adds **nothing**.

**Football is better at this because its cliff is bigger relative to its own year-over-year
noise** -- 6.09x the cohort sigma against baseball's 3.78x and basketball's 4.46x -- not because
its cohorts are bigger (1508 / 502 / 231 athletes per age).

**The false-positive economics, which are the real decision.** Flagging a career is not flagging
a day: 2% of clean seasons buys 14-19% of cliffs, 5% buys 30-73%, 10% buys 50-84%.

### Two things measured because they would otherwise have been asserted

**Pooling across teams does NOT make the chronic channel finer.** Basketball scored in cohorts
from 18 athletes to 720: residual sigma 0.34 / 0.34 / 0.35 / 0.33 / 0.35, detection 23.8% /
22.5% / 22.5% / 21.2% / 25.0%. Sigma is a property of the population, not of the sample. What a
small roster actually has is a **noisy estimate** of it, and that is severe: the threshold taken
off one 18 man team in one season ranges **0.54 to 4.38** (mean 1.32), against 1.14 to 1.48 at
ten teams. A nominal 10% channel that really flags 30% of a clean roster, or nobody at all. So
**pool to estimate the threshold, score on the athlete's own roster** -- two different uses of a
cohort, and only one of them is worth doing.

**The career channel works on 15 year olds, and that is the problem.** Re-run with a 14-17 entry
age, it holds its false positive rate at 9-10% from 15 through 23, because the age-cohort
normalisation absorbs growth automatically -- a 15 year old is compared to other 15 year olds who
are also improving (median -1.90 swings a year at 15, -1.37 at 19). Which means a 15 year old who
improves by 1.0 swing while his cohort improves by 1.9 is **2.7 sigma and gets flagged, working
exactly as designed**, for developing more slowly than his peers. That sentence must never reach a
child. It is the strength profile's movement-not-body-part rule again, one level worse.

And the channel is least trustworthy **exactly at the peak**: ages 24-26 the cohort sigma jumps
0.20 -> 0.44 -> 0.77 and the flag rate goes 17.2% -> 30.0% -> 0.8%, because individuals cross
their peak at different ages so the cohort is a mix of risers and fallers. The nominal 10% is not
10% in that band.

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
