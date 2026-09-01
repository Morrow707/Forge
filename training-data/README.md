# Training data

Raw reference photos for training real, on-device CoreML object detectors
for the AV tracking pipeline (see `scripts/<detector-name>/README.md` for
each detector's pipeline runbook). Nothing in this directory is used by the
app at runtime -- it's the source material and prep workspace for training a
model that later gets bundled into `ios/App/App/` as a `.mlpackage`.

Each detector gets its own subdirectory:

```
training-data/
  <detector-name>/
    raw/       -- reference photos, as sent (any name, any format)
    labels/    -- one JSON file per raw photo, same basename, written by
                  Claude reviewing that photo directly (see the pipeline
                  README for the exact label format) -- never auto-generated,
                  never touched by a script
```

`raw/` grows over time as more reference photos come in (new gyms, new
lighting, new equipment) or as real in-app detections get confirmed and
added back (see each pipeline's own notes on this). More, more varied
photos make for a better detector -- there's no "done" here, just
"good enough to ship a first version."
