# App Store metadata

Managed by `fastlane deliver` through two lanes in `ios/fastlane/Fastfile`.
**The order matters.**

## 1. `download_metadata` — always first

Pulls the CURRENT live listing down into this directory and uploads nothing.
Commit what it produces before changing a word. Until that has run, the only
files here are the two written by hand (below), and `upload_metadata` will
refuse to run.

## 2. Edit

Change the text files. The camera-accuracy copy, and where each piece belongs,
is in `docs/app-store-listing-copy.md`.

## 3. `upload_metadata`

Pushes this directory to App Store Connect. Metadata only: no binary, no
screenshots, and it does **not** submit for review. Those are separate,
deliberate actions and none of them should ride along with a copy change.

## Why the guard exists

`deliver` uploads what it finds here. A folder assembled by hand is a folder
nobody has compared against the live listing, and uploading from one is how a
real description gets replaced by a placeholder. `upload_metadata` requires
`en-US/description.txt` — a file only `download_metadata` produces — so the
read always happens before the write.

## What is checked in by hand, and why only these two

`promotional_text.txt` and `release_notes.txt`.

Promotional text is the only listing field that can change **without
submitting a new build**, which makes it the one that can carry the
camera-accuracy disclosure today. Release notes are per-version and written
fresh each time anyway.

`description.txt` is deliberately absent. The live description is not in this
repo and has never been read from here; writing one from scratch would mean
overwriting working copy with a guess. Download it, then insert the paragraph
from `docs/app-store-listing-copy.md` into what comes back.
