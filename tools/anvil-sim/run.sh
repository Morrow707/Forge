#!/usr/bin/env bash
# Every analysis, in the order the findings were made.  Assumes ./build.sh has run.
set -euo pipefail
cd "$(dirname "$0")"
run () { echo; echo "######## $1"; echo; python3 "$1"; }
run tau.py            # the per-sport record, and its no-leak check
run plateau.py        # why two states was the wrong number
run chronic4.py       # the four detector forms
run chronic_limit.py  # the published floor, validated against the real runs
run resolution.py     # the two channels in one unit
run compare.py        # football against baseball, one detector
run why_r2.py         # why load explains one world and not the other
run form_by_sport.py  # and therefore why the form is chosen per roster
run raw_spread.py     # the anchor means opposite things in the two sports
run career_channel.py # careers: aging, cliffs, trades, and what cannot be predicted
