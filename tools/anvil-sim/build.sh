#!/usr/bin/env bash
# Regenerate every world from its seeds.  Deterministic: the same seeds give the same
# worlds byte for byte, which is why the generated JSON is NOT committed (it is ~12MB)
# and this script is.  Takes about a minute.
set -euo pipefail
cd "$(dirname "$0")"
echo "== baseball: 40 man roster, 2026-02-14 -> game 7, three-state model =="
for s in 2702 3813 4924 6035; do python3 mlb2.py "$s"; done
echo
echo "== baseball CONTROL: the same four seasons on the one-pool model =="
for s in 2702 3813 4924 6035; do python3 mlb.py "$s" >/dev/null; done
echo "   (written, no output -- it exists only so the acute channel can be shown unmoved)"
echo
echo "== football: 125 man roster, 17 games, three-state model =="
for s in 1125 2026 4419 7731; do python3 sim125b.py "$s"; done
echo
echo "== basketball: 18 man roster, 112 games, DEFAULTED taus =="
echo "   40 seasons, not 4: an 18 man roster gives 2 slow decliners a season, so four seeds"
echo "   put the detection rate on one-athlete granularity (it read 4.2%, which was 1 of 24)."
for s in $(seq 3001 3040); do python3 nba.py "$s" >/dev/null; done
python3 nba.py 3001 | head -2
echo
echo "== careers: 6 teams x 14 seasons, all three sports, 3 leagues each =="
for s in 9001 9002 9003; do for sp in baseball football basketball; do python3 career.py "$sp" "$s" 14; done; done
echo
echo "== the lifetime cohort: 75 athletes, 25 per sport, ages 13 to 45 =="
for s in 5001 5002 5003 5004; do python3 lifetime.py "$s"; done
