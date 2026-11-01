"""FIX 3: the decay constant is sport-shaped, so it is a LOOKUP, not a module constant.

Same shape as shared/camera-tunables-by-lift.ts: a fresh record per sport, a `sources` map
saying whether each number is SHARED (the default nobody has fitted) or FITTED on this sport,
and an evidence entry required for every fitted value.

Nothing is fitted yet except the two the football and baseball runs measured, and the entry
says so.  A sport with no record gets the default and is MARKED as defaulted, never silently
handed baseball's numbers -- the leak this exists to stop.
"""
DEFAULT = {
    # THREE states, and the third is not a fatigue pool -- see plateau.py.  An exponential pool
    # is at 95% of its ceiling after 3 tau, so nothing with a tau under ~83 days is still RISING
    # in September of a 248 day season.  Measured on one catcher's real load series:
    #   tau 28 moves  -1.2% from June to September (flat -- correctly, it tracks the MONTH)
    #   tau 120 moves +35.8% and peaks on the last day (it integrates the SEASON)
    # Calling both of those "fatigue" is what made the first version of this fix wrong.
    "acuteTauDays":   3.5,    # yesterday's game
    "chronicTauDays": 28.0,   # the month behind you: schedule envelope, off-day density, travel
    "wearTauDays":    120.0,  # the season: cumulative work with a leak slow enough to ignore
    "acuteGain":      0.030,  # load -> acute pool (unnormalised, as the single-pool model had it)
    "acuteWeight":    0.055,  # acute pool -> the observable
    "chronicWeight":  0.016,  # chronic pool (load units) -> the observable
    "wearWeight":     0.013,  # wear pool (load units) -> the observable
}

FITTED = {
    # sport        : {field: value}
    "football":     {"chronicTauDays": 21.0, "wearTauDays": 70.0},
    "baseball":     {"chronicTauDays": 28.0, "wearTauDays": 120.0},
}

EVIDENCE = {
    "football.chronicTauDays":
        "2026-11-01, 125 athletes x 17 weeks x 4 seasons; one game a week, so the chronic pool "
        "clears between game weeks and a shorter tau fits the observed week-to-week recovery.",
    "baseball.chronicTauDays":
        "2026-11-01, 40-man roster, 2026-02-14 to the end of a max postseason (248 days, 184 "
        "games); daily play, so the pool never clears and tau is set by the in-season plateau.",
    "football.wearTauDays":
        "2026-11-01, same run; a 17 week season is 119 days, so 3 tau must land inside it or the "
        "wear term is still rising at the bowl game and cannot be distinguished from a decline.",
    "baseball.wearTauDays":
        "2026-11-01, same run; chosen so the wear term is at 87% of its ceiling on the last day "
        "of a max postseason -- rising all season, which is the whole point of the third state.",
}

def tunables(sport):
    """A FRESH record every call, plus where each number came from."""
    rec = dict(DEFAULT)
    src = {k: "shared" for k in DEFAULT}
    for k, v in FITTED.get(sport, {}).items():
        rec[k] = v; src[k] = "fitted"
    rec["sources"] = src
    rec["sport"] = sport
    rec["defaulted"] = sport not in FITTED      # a sport nobody measured SAYS SO
    return rec

if __name__ == "__main__":
    for s in ("baseball", "football", "basketball"):
        t = tunables(s)
        fit = [k for k, v in t["sources"].items() if v == "fitted"]
        print(f"  {s:<11} acute tau {t['acuteTauDays']:>4}  chronic tau {t['chronicTauDays']:>5}  "
              f"fitted: {','.join(fit) if fit else 'nothing (defaulted)':<34} "
              f"{'DEFAULTED' if t['defaulted'] else ''}")
    # the leak test the camera registry uses: scribble on one, the others must not move
    a = tunables("baseball"); a["chronicTauDays"] = 999
    assert tunables("baseball")["chronicTauDays"] == 28.0, "records are shared!"
    assert all(k in EVIDENCE for s, f in FITTED.items() for k in (f"{s}.{x}" for x in f)), \
        "a fitted value with no evidence"
    print("\n  records are fresh per call, and every fitted value carries evidence.")
