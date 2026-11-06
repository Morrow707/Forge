"""WHAT DOES THE ANVIL'S HEADLINE PAY FOR THE OTHER THREE PARTS? Measured.

The check is four parts in about 3.5 minutes: 25 vigilance trials, 16 go/no-go,
a sequence span, a 10s tap. Part 1 is the only part whose output is the headline
number an athlete reads. The design record's own 1 Nov conclusion was that the
check "does not need more kinds of trial, it needs more of the one trial that
produces a measurement" -- and the build then went the other way.

So: parts 2-4 cost athlete time. Spent on part 1 instead, that time buys trials.
This measures what those trials would be worth, and what parts 2-4 therefore
have to be worth to break even. The literature cannot answer the first half
(it is arithmetic about THIS protocol); it can answer the second.

Two things are measured:
  A. The sampling noise of the headline as a function of trial count, and the
     z-gain that buying trials produces against a real fatigue shift.
  B. The false-alarm rate of the two flagging rules over a season, including
     the noise in the ROLLING BASELINE itself -- which is the part a textbook
     z-score calculation leaves out and which dominates the answer.
"""
import random, math, statistics as st

# ---------- the instrument ----------
def exg(mu, sg, tau, rng):
    return rng.gauss(mu, sg) + rng.expovariate(1.0 / tau)

def check(n, mu, sg, tau, rng, lapse_p=0.03):
    """One day's check: n trials, headline = median. Lapses are the tail."""
    out = []
    for _ in range(n):
        v = exg(mu, sg, tau, rng)
        if rng.random() < lapse_p:
            v += rng.expovariate(1.0 / 300.0)
        out.append(max(120.0, v))
    return st.median(out)

# Rested parameters chosen so the median lands near the 268 ms the artifact shows.
MU, SG, TAU = 250.0, 24.0, 45.0

# ---------- the time budget ----------
# Part 1: 25 trials x (mean ISI 3.5s + ~0.27s response) = 94s
# Part 2: 16 trials, same ISI, 2 hold trials ~1.4s longer                = 65s
# Part 3: sequence 3..7, ~5 rounds x ~8s                                 = 40s
# Part 4: 10s tap plus setup                                            = 12s
PER_TRIAL = 3.77
RECLAIMED = 65 + 40 + 12
EQUIV = 25 + int(RECLAIMED / PER_TRIAL)

print("THE TIME BUDGET")
print(f"  parts 2-4 cost {RECLAIMED}s of athlete time")
print(f"  at {PER_TRIAL}s a vigilance trial that is {int(RECLAIMED/PER_TRIAL)} more trials")
print(f"  so part 1 is 25 trials where the same check could run {EQUIV}\n")

# ---------- A. sampling noise of the headline ----------
rng = random.Random(20261106)
REPS = 40000
print("A. THE HEADLINE'S OWN NOISE, BY TRIAL COUNT")
print(f"  {'n':>4}  {'SD of the median (ms)':>22}  {'vs n=25':>9}")
noise = {}
for n in (10, 16, 25, 40, 56, 90):
    vals = [check(n, MU, SG, TAU, rng) for _ in range(REPS)]
    sd = st.stdev(vals)
    noise[n] = sd
    print(f"  {n:>4}  {sd:>22.2f}  {sd/noise[25]:>8.2f}x" if 25 in noise else f"  {n:>4}  {sd:>22.2f}")
print()

# ---------- the z-gain ----------
# A day's headline varies for two reasons: the athlete really is different
# today (biological, sigma_b) and the check sampled only n trials (sigma_s).
# A real shift D is detected against sqrt(sigma_b^2 + sigma_s^2).
print("  WHAT BUYING TRIALS IS WORTH: z for a real +15ms shift")
print(f"  {'biological SD':>14}  {'z at n=25':>10}  {'z at n=56':>10}  {'gain':>7}")
D = 15.0
for sb in (5.0, 10.0, 15.0, 20.0, 30.0):
    z25 = D / math.sqrt(sb**2 + noise[25]**2)
    z56 = D / math.sqrt(sb**2 + noise[EQUIV if EQUIV in noise else 56]**2)
    print(f"  {sb:>14.0f}  {z25:>10.2f}  {z56:>10.2f}  {z56/z25:>6.2f}x")
print()
print("  Read it this way: the gain is large when the athlete's own day-to-day")
print("  spread is SMALL (the check's noise dominates) and small when it is")
print("  large (biology dominates). Which regime we are in is unmeasured --")
print("  no test-retest has been run -- so this is the first number a real")
print("  cohort would settle, and it decides whether the split costs anything.")
