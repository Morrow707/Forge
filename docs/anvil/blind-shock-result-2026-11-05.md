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
