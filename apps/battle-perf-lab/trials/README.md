# Fixed-production-build Menu trials

One runner for one trial: serve an already-built Menu artifact, prove it is the
build that was recorded, drive the unchanged in-game benchmark through it, and
archive the result where nothing can overwrite it. `runTrial.ts` is the entry;
`trial.ts` owns the sequence, `provenance.ts` the build identity, `host.ts` the
machine evidence.

```sh
node apps/battle-perf-lab/trials/runTrial.ts \
  --backend raw --url http://127.0.0.1:5261/ \
  --build-manifest <fixed-menu-builds>/manifest.json \
  --render-config <declaration>.json \
  --out <trials>/raw-0 --order 0
```

Run `runTrial.ts` with no arguments for the full flag list. It launches a browser
and runs the real five-minute window, so only the agent holding the GPU may start
one, and only one at a time.

## What this runner is not

It owns no measurement. The Menu's own benchmark owns the recording and the FPS
formulas, the unchanged `battle-benchmark-complete` scene owns the checks and
the shared `runSelected` runner owns the browser, and the
[offline scorecard](../report/README.md) owns pair validity. This runner only
decides whether a trial _happened under known conditions_, and preserves the
evidence either way. It never claims a speed, a visual result or a backend.

## Two eligibilities, never merged

**Functional eligibility** asks whether this trial produced a valid recording of
the declared fixed build: provenance matched, the scene's checks passed, the page
raised no errors, the export is this run's, and the report's identity agrees with
what the runner set. **Quiet ranking** asks the separate question of whether the
result may enter a comparison: the host observation series was collected and
stayed inside the declared policy, and every hardware field was actually read. A
run can be perfectly valid and still unrankable; that is the normal case on a
shared machine, and the record says so rather than hiding it.

Both verdicts, their reasons and every artifact digest land in `trial.json`. The
`{ manifest, report }` pair the scorecard consumes lands in `run.json`, carrying
a `RunManifest` as `compareRuns.ts` defines it.

## Provenance is checked before the browser starts

The fixed-build manifest records every emitted file and every shared public/atlas
file with its size and SHA-256, plus lockfile, WASM, commit and dirty-diff
digests. The runner re-derives the manifest's own list digests — reproducing the
generator's canonical `sort_keys`/compact JSON encoding, so a doctored summary
cannot vouch for itself — then streams each recorded file a chunk at a time,
refusing anything longer than its recorded length. Nothing is copied: the shared
trees are read in place, and a total byte budget bounds the whole sweep.

The served URL is checked the same way: its index bytes must be this backend's
recorded `index.html`, its atlas catalog must be the verified one, and cross-origin
isolation must still be present. A mismatch rejects the trial before a browser
exists, which is the only point at which rejecting is free.

`--render-config` is the one input the runner cannot derive. A fixed build has its
render configuration compiled in and the runner will not guess it, so the operator
declares it in a file whose bytes become the manifest's `configSha256`. Use the
same declaration for every trial in a comparison; an absent one blocks eligibility
rather than defaulting.

## Host evidence is collected, never assumed

Hardware, OS, power and display come from macOS tools run once _before_ the
browser launches, so probing cannot contaminate the window. Anything a tool does
not return stays `null` and blocks ranking; no field is inferred from another.
Browser version comes from the live Playwright browser and the GPU adapter from
the report's own identity.

Quiet status comes from a series, not a snapshot: one observation before the run,
one after, and bounded periodic ones during it. The runner's own process subtree
is excluded by pid, so the browser it started does not count against it while a
competing build or benchmark does. `QUIET_HOST_POLICY` in `host.ts` holds the
thresholds and the short list of system processes attributed to the trial's own
presentation; it is archived with every run so a reviewer can disagree with it
instead of guessing. A missing pre- or post-observation can never be quiet. When
isolation has to be established some other way, `--host-evidence` records an
external pointer alongside the series — it is recorded for a human, and never
flips the verdict by itself.

## Audio, and nothing else, is changed

The trial seeds the real graphics-settings storage key with `{"audio":{"muted":
false}}` in the fresh browser context before any app module runs. Only that one
field is declared, so the settings owner's sanitizer supplies every other default
— the quality settings cannot drift with this runner. The runner then verifies
the recorded identity came back unmuted and that every submission presented as the
declared backend. Cross-trial graphics equality stays the scorecard's job.

## Never overwriting, always preserving

The output directory is created exclusively and every file is written with an
exclusive flag, so a repeated `--out` fails instead of replacing a prior trial.
Rejected and failed trials keep everything they collected — host series, scenario
report, the export when it was this run's. The archived export is only accepted
when the scene wrote it during this trial, so a previous run's bytes can never be
filed as this one's evidence.

## Verification

`trials/*.test.ts` run under the lab's Vitest configuration and cover the seams
this pass can reach without a GPU: provenance mismatch, failure evidence, refusal
to overwrite, the functional/ranking split, and the storage key pinned against the
real settings owner. The browser seam is injected, so none of them start Chrome.

Actual browser validation is the orchestrator's, on the machine holding the GPU:
serve one fixed build at a time with the preview command its build README records,
then run the command at the top of this file with the next `--order` and a fresh
`--out`. Check `trial.json` for both verdicts before feeding any `run.json` pair
to the scorecard. Until a trial has been run that way, this runner has produced no
timing evidence at all.
