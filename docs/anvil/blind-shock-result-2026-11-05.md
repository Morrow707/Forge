# The blind shock test: RESULT

**The hypothesis is falsified.** Run against `blind-shock-spec-2026-11-05.md` + Amendment 1,
exactly as registered. 12 football seasons, 1,500 athletes, 15% shocked.

---

## The machinery is sound before the finding is read

**Null arm: false-positive floor 10.4% ±0.4, against a design of 10%.** The threshold pinning
works. Every detection figure below is against that floor.

**Internal consistency check that had to pass and did:** the slow channel reads load and not
sleep, so its detection must be *flat* in ρ (sleep leakage). It is — 58%, 61%, 52%, 55% across
ρ = 0 → 0.9 at 2× noise. A detector that moved with a variable it cannot see would mean the
harness was wrong.

## The primary (registered) run was underpowered, and I say so rather than leaning on it

The spec registered onset as **uniform over the middle 60% of the season**. The detection window
is the **last 45 days of 159**. So a shock starting at 0.20 of the span is thirty days gone
before the window opens, and most shocks were invisible to the detector by construction. All
detection rates in the primary sit at 8–33% and the comparisons are inside their spreads.

That is a defect in my instrument, not a property of the hypothesis. The registered run stands
as the primary and its ordering is reported below; a **declared post-hoc secondary** reruns it
with onset forced into the window, purely to ask whether the ordering survives when the shock is
actually visible. It does, far more sharply.

## The result

**Secondary, 2 × noise, λ = 0** (detection %, 10% floor):

| ρ (leakage into sleep) | slow (load only) | sleep-only | **Converge** |
|---|---|---|---|
| 0.0 | 58% | 13% | 55% ±22 |
| 0.3 | 61% | 26% | 50% ±37 |
| 0.6 | 52% | 51% | **33%** ±27 |
| 0.9 | 55% | 71% | **21%** ±18 |

**At 1 × noise, λ = 0:** ρ=0.0 → slow 32%, sleep 15%, Converge 28%. ρ=0.9 → slow 30%,
**sleep 66%**, **Converge 14%**. Same shape at every λ.

Three things, and all three are monotonic:

1. **Converge never beats the slow channel. Not in one cell of the surface.** Adding the sleep
   column strictly costs detection.
2. **As the shock leaks into sleep, Converge gets monotonically WORSE** (55 → 50 → 33 → 21) while
   sleep-only gets monotonically better (13 → 26 → 51 → 71). They cross at about ρ = 0.6.
3. At ρ = 0.9 Converge is **50 points behind** sleep-only, against spreads of ±18. The criterion
   asked Converge to *beat* sleep-only by more than the combined spreads. It loses by more than
   the combined spreads.

**Falsification was stated in advance and is not renegotiated. This is the finding.**

## Why — and the mechanism is the one Amendment 1.1 predicted

Converge flags the **residual**. A residual is by definition what your predictors cannot explain.
So when the stressor degrades sleep, the regression correctly attributes the performance drop to
sleep — and the residual, *which is the thing Converge flags*, has the signal regressed out of
it. **Converge removes what it is trying to detect.**

That is not a bug in the implementation. It is what "flag the disagreement" *means* when a
predictor is correlated with the target.

**And it generalises past this test.** The disagreement channel can only ever see stressors that
bypass everything you already measure. The better your predictors, the less the residual can see.
The realistic case — exams wrecking sleep, travel wrecking sleep — is precisely the case where
the predictor is most informative, so **the disagreement is weakest exactly where the use case is
strongest.**

## What this does NOT falsify, stated so the finding is not over-read

Falsified: **flagging the residual of a regression that carries your predictors.** That is what
the spec declared and what fails.

Not tested, and not falsified:

- **Sleep as an independent channel.** Sleep-only is the *best detector on the surface* at high
  leakage — 71% against the slow channel's 55%.
- **Running both and taking whichever fires.** `max(slow, sleep-only)` is at or near the best cell
  everywhere on this surface: 58% at ρ=0, 71% at ρ=0.9. It beats Converge by 3 points at worst
  and 50 at best.
- Using the predictors to set an expected band and flagging deviation in either direction.

## The replacement is simpler than the thing it replaces, and it is this platform's own rule

**Run the channels in parallel. Do not regress one out of the other.**

That is Rule #2 of the camera architecture, word for word: *every sensor is a peer, none leads,
the arbiter owns none of them, and when one fails the other is there to pick it up.* Regressing
sleep out of v makes sleep a **leader** that overrides the other witness — which is the shape
this repo has already refused once, in a different system, for the same reason.

The Anvil broke its own platform's most-repeated rule, and a test it was free to fail is what
found it.

## Limits on these numbers

- **Amendment 1.5 governs.** Gaussian capture noise. The *relative* ordering at a matched floor is
  far more robust to that than the absolute rates, but neither should be quoted outside the harness.
- The secondary is post-hoc. It is reported as a power diagnostic for the primary, not as the
  registered test. Both show the same ordering; the secondary shows it outside the spreads.
- Football only, 12 seasons. λ (leakage into load) moved almost nothing on this surface — worth
  noting as a null, and worth re-checking in a sport where load varies more within a week.

*Run 2026-11-05. `tools/anvil-sim/blindshock.py` (registered), `blindshock2.py` (secondary).*

---

# AMENDMENT TO THE RESULT — 2026-11-05, after an adversarial review

## The replacement was compared at double the false-alarm budget. My error, now measured.

`max(slow, sleep-only)` was reported with **each channel pinned at 10%**. The OR of two 10%
tests is not a 10% test: up to `1 − (1−.1)(1−.1) = 19%` when the errors are independent. So the
replacement was given twice Converge's false-alarm budget, and a coach's morning list would have
gone back up with it. The review that caught this was right and the original comparison was not
apples to apples.

Re-pinned by bisection on a common quantile until the **combined** false-positive rate is 10%,
with Converge keeping its own 10% (`blindshock3.py`):

| ρ | quantile | combined FP | OR detection | Converge | verdict |
|---|---|---|---|---|---|
| 0.0 | 0.950 | 10.0% | 49% ±28 | 55% ±22 | tied |
| 0.3 | 0.950 | 10.3% | 55% ±33 | 50% ±37 | tied |
| 0.6 | 0.950 | 10.1% | 59% ±26 | 33% ±27 | tied |
| 0.9 | 0.950 | 10.1% | **68% ±24** | 21% ±18 | **OR wins** |

(2 × noise, λ=0. At 1 × noise the OR wins at both ρ=0.6 and ρ=0.9 — 50% vs 15% and 60% vs 14%.)

**The quantile had to move 0.90 → 0.95** — each channel really does have to run at about 5% to
hold the OR at 10%, exactly as the critique's arithmetic said. After paying that cost in full:

**The conclusion survives, at reduced strength.** The honest statement is now *tied at low sleep
leakage, strictly better at high leakage, and Converge never wins anywhere.* Not "always better."

## The "straw man" charge: conceded in part, and one of its three survivors is the thing it replaces

The charge is that this falsified *linear OLS residualisation with collinear regressors*, not
*predictive anomaly detection*. **Half right, and the half that lands is the headline.** What was
pre-registered and run is the design Forge was going to build; the headline should have said
*residual-flagging is falsified*, which the body already said, rather than *the hypothesis*.

Of the three formulations offered as surviving it:

- **A · Expectation bounding** (`predict ŷ, threshold at ŷ + 1.96σ`) **is algebraically the test
  that was run.** `y > ŷ + kσ` ⟺ `y − ŷ > kσ` ⟺ `residual > kσ`. The band *is* the residual.
  The only genuine difference is a heteroscedastic σ, and that does not help: the **centre** still
  moves with sleep, which is where the signal goes. And taken at its own word — *"if it drops
  exactly as much as poor sleep explains, it is an expected fatigue flag"* — it flags on the
  prediction as well as the residual, which is `max(sleep-only, residual)`: the replacement.
- **B · Mechanistic asymmetry** (a bad reading on *good* sleep is the alarming one) is real,
  different, and untested. But it is the **ρ=0 corner, where the residual already works** — 55%
  against the slow channel's 58%. A sharpening of a case that was never the problem, not a rescue
  of the case that was.
- **C · Causal path decomposition** stops residualising and starts estimating a total effect. Once
  you flag the total effect rather than the leftover, you are running channels in parallel again.

All three either collapse into the replacement or live in the corner where nothing failed.

*Amendment run 2026-11-05. `tools/anvil-sim/blindshock3.py`.*
