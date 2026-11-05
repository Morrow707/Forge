"""Does the FAST channel self-clear under sustained fatigue?

The claim, from an adversarial review 2026-11-05: compare.py::acute() takes its baseline
from the twenty captures IMMEDIATELY PRECEDING, with no exclusion of flagged ones.  So an
athlete held in a fatigued state for weeks has their own baseline walk up to meet them, the
z-score decays to nothing, and the system reports them normal while they are as wrecked as
they have ever been.  The fast channel would see TRANSITIONS and not STATES.

This file measures it.  It does NOT re-implement the detector: it imports acute() from
compare.py and the per-day variant below is PROVEN to reproduce acute()'s own answer exactly
before any shock is injected (see verify()).  A diagnostic that scores its own ruler measures
nothing -- docs/anvil/blind-shock-spec-2026-11-05.md, and plateBoxToExpectedRatio before it.

Declared before running, as the spec requires of anything with a knob:
    shock magnitudes   {1.0, 1.5, 2.0} x NOISE, swept, never one picked value
    shock duration     21 days, long enough for a 20-capture baseline to turn over twice
    onset              day 60 of each athlete's own span
    thresholds         BOTH the z>=2.0 single day that acute() ships with AND the shipped
                       product rule (a run of 3 consecutive days at z>=1.25)
    reported           flag rate per 3-day bin from onset, against the no-shock floor,
                       with the spread across seeds
"""
import sys, json, statistics as st
from collections import defaultdict

# compare.py does its whole three-world run at module scope, so `import compare` executes it
# and dies on data this test does not need.  Same shape as the CLI the repo already had to
# split (server/check-schema-drift.ts: "nothing the server imports may process.exit").
# So its DEFINITIONS are loaded and its top-level run is not -- the detector is still the
# committed one, character for character, and is not copied into this file.
def _load_compare():
    src = open("compare.py").read()
    cut = src.index("\nprint(")                  # first top-level statement after the defs
    ns = {"__name__": "compare_defs"}
    exec(compile(src[:cut], "compare.py", "exec"), ns)
    assert "acute" in ns and "load" in ns, "compare.py's shape changed; fix the cut"
    return ns
compare = type("c", (), _load_compare())

NOISE = compare.NOISE                            # 0.0115
MAGS  = (1.0, 1.5, 2.0)
DUR   = 21
ONSET = 60
WARM, N = 10, 20                                 # acute()'s own constants

# ---------------------------------------------------------------- the per-day variant
def z_by_capture_guarded(rs, thr, warm=WARM, N=N):
    """The proposed FIX: a capture that itself flagged is not admitted to the baseline of
    later captures, so a sustained state cannot teach the baseline to accept it.

    Measured on the no-shock arm as well as the shocked one, because a 'fix' that holds
    detection up by also raising the false-positive floor has fixed nothing."""
    out, clean = [], []
    for r in rs:
        prev = clean[-N:]
        if len(prev) < warm:
            out.append((len(out), None)); clean.append(r); continue
        v = [h["v"] for h in prev]
        m, sd = st.mean(v), st.pstdev(v)
        if sd <= 0:
            out.append((len(out), None)); clean.append(r); continue
        z = (r["v"] - m) / sd
        out.append((len(out), z))
        if z < thr: clean.append(r)          # a flagged capture never joins the baseline
    return out

def z_by_capture(rs, warm=WARM, N=N):
    """acute()'s arithmetic, one z per capture instead of one percentage per athlete.
    Every line here is lifted from compare.py::acute and must stay that way."""
    out = []
    for k, r in enumerate(rs):
        prev = rs[max(0, k - N):k]
        if len(prev) < warm:
            out.append((k, None)); continue
        v = [h["v"] for h in prev]
        m, s = st.mean(v), st.pstdev(v)
        if s <= 0:
            out.append((k, None)); continue
        out.append((k, (r["v"] - m) / s))
    return out

def verify(by):
    """The per-day variant must reproduce acute()'s published answer EXACTLY, or the
    measurement below is of something else."""
    theirs = compare.acute(by)
    mine = {}
    for i, rs in by.items():
        zs = [z for _, z in z_by_capture(rs) if z is not None]
        if zs:
            mine[i] = (100 * sum(1 for z in zs if z >= 2.0) / len(zs), len(zs))
    assert set(mine) == set(theirs), "different athletes scored"
    bad = [i for i in theirs if abs(mine[i][0] - theirs[i][0]) > 1e-9 or mine[i][1] != theirs[i][1]]
    assert not bad, f"{len(bad)} athletes disagree with acute()"
    return len(theirs)

# ---------------------------------------------------------------- the shock
def shocked(rs, onset_doy, mag):
    """A flat sustained shock on the OBSERVABLE, applied for DUR days from onset.

    SIGN, established empirically and not assumed: in this model a DEGRADED athlete
    produces a HIGHER v.  compare.py::chronic puts decliners at a median residual of
    +0.573 (fast) and +0.156 (slow) against clean at -0.082, and the detector flags the
    HIGH tail -- 21.4% / 20.3% against a 10.1% clean floor.  So the shock ADDS.
    The first draft of this file subtracted, which injects 'gets better': flag rates fell
    BELOW the no-shock floor and fell further the bigger the shock.  That is the sign error
    this project already paid for once (chronic2.py), caught here only because the result
    was nonsense and nonsense got checked instead of reported.

    Flat on purpose: a ramp would confound 'the baseline adapted' with 'the shock eased'."""
    out = []
    for r in rs:
        q = dict(r)
        if onset_doy <= r["doy"] < onset_doy + DUR:
            q["v"] = r["v"] + mag * NOISE
        out.append(q)
    return out

BINS = [(1,3),(4,6),(7,9),(10,12),(13,15),(16,18),(19,20)]   # the shock runs d0..d20

def rates(by, mag, thr, runlen, guard=False):
    """flag rate per 3-day bin from onset. runlen=1 is acute()'s own single-day rule;
    runlen=3 with thr=1.25 is the rule the product actually ships."""
    hits = {b: [0, 0] for b in BINS}
    for i, rs in by.items():
        if len(rs) < 40: continue
        doys = [r["doy"] for r in rs]
        on = doys[0] + ONSET
        if on + DUR > doys[-1]: continue
        sh = shocked(rs, on, mag)
        zs = dict(z_by_capture_guarded(sh, thr) if guard else z_by_capture(sh))
        run = 0
        for k, r in enumerate(rs):
            z = zs.get(k)
            if z is None: run = 0; continue
            run = run + 1 if z >= thr else 0
            d = r["doy"] - on
            if not (1 <= d <= DUR - 1): continue
            for b in BINS:
                if b[0] <= d <= b[1]:
                    hits[b][1] += 1
                    if run >= runlen: hits[b][0] += 1
    return {b: (100 * h[0] / h[1] if h[1] else 0.0) for b, h in hits.items()}, \
           {b: h[1] for b, h in hits.items()}

def main(files):
    print("\n  DOES THE FAST CHANNEL SELF-CLEAR UNDER SUSTAINED FATIGUE?")
    print(f"  {DUR} day flat shock from day {ONSET}; flag rate per 3-day bin; "
          f"4 seasons, mean +- spread\n")
    loaded = []
    for f in files:
        D, by, kind = compare.load(f)
        n = verify(by)
        loaded.append((f, by, n))
    print(f"  per-day z reproduces compare.py::acute() exactly on all "
          f"{sum(n for _,_,n in loaded)} athletes across {len(loaded)} seasons\n")

    for thr, runlen, name in ((2.0, 1, "acute() as written: single day, z>=2.0"),
                              (1.25, 3, "the shipped rule: 3 days running, z>=1.25")):
        for guard in (False, True):
            tag = "  + THE FIX: a flagged capture never joins the baseline" if guard else ""
            print(f"  {name}{tag}")
            print(f"  {'magnitude':<14}" + "".join(f"{f'd{a}-{b}':>9}" for a, b in BINS))
            print("  " + "-" * (14 + 9 * len(BINS)))
            for mag in (0.0,) + MAGS:
                per = [rates(by, mag, thr, runlen, guard)[0] for _, by, _ in loaded]
                lab = "no shock" if mag == 0 else f"{mag:g} x noise"
                row = f"  {lab:<14}"
                for b in BINS:
                    v = [p[b] for p in per]
                    row += f"{st.mean(v):>6.1f}+-{(max(v)-min(v))/2:<2.0f}"
                print(row)
            print()

if __name__ == "__main__":
    main(sys.argv[1:] or [f"fb_{s}.json" for s in (1125, 2026, 4419, 7731)])
