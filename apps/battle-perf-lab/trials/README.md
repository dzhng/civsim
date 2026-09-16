# Fixed-production-build Menu trials

One runner for one trial: serve an already-built Menu artifact, prove it is the
build that was recorded, drive the unchanged in-game benchmark through it, and
archive the result where nothing can overwrite it. `runTrial.ts` is the entry;
`trial.ts` owns the sequence, `provenance.ts` the build identity, `digest.ts` the
bounded content digests both the local and served checks read through, and
`host.ts` the machine evidence.

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
the declared fixed build: provenance matched, the scene exited clean and wrote
its own scenario report with checks in it, those checks passed, the page raised
no errors, the export is this run's, and the report's identity agrees with what
the runner set and with the declared render configuration. The scene's exit code
is its own verdict and is never overridden by the evidence it happened to leave
behind — an empty failure list is equally what an unwritten or foreign report
looks like once it has been read back, so a clean exit plus real checks are both
required. **Quiet ranking** asks the separate question of whether the result may
enter a comparison: the host observation series covered the window and stayed
inside the declared policy, and every hardware field was actually read. A run can
be perfectly valid and still unrankable; that is the normal case on a shared
machine, and the record says so rather than hiding it.

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
trees are read in place. A recorded size that is not a byte count is refused
before a stream is even opened, and a read is charged to the sweep's byte budget
whether or not its digest succeeded, so neither a malformed manifest nor a pile of
oversized entries can read without bound.

The served URL is checked the same way, and not only at its entry points: the
index bytes must be this backend's recorded `index.html`, the atlas catalog must
be the verified one, cross-origin isolation must still be present, **and every
other emitted artifact is fetched from the server and digested**, because a stale
directory on the same port can hand out the recorded index beside somebody else's
bundles. Each served read is bounded before the request is made — a timeout, and
a body limit one byte past the recorded size, so a longer body reveals itself as
longer instead of matching on a truncated prefix.

The shared public and atlas trees are gigabytes and are deliberately _not_
pulled over HTTP. They are hashed where they sit, which is only evidence about
served bytes if the server reaches those same trees: every recorded shared file
is walked down its own served path until it meets the shallowest link the build
actually made, and that link has to resolve to the tree the file was hashed in.
The link is what the contract is on, never the served prefix above it — a build
emits its own `assets/` directory of JS and WASM and links a shared subtree such
as `assets/soldiers` inside it, so a served prefix is routinely part emitted and
part shared. A recorded file that reaches no link, or one whose link lands on
another tree, is recorded as unlinked and rejects the trial rather than letting a
local digest quietly speak for bytes nobody checked.

A mismatch rejects the trial before a browser exists, which is the only point at
which rejecting is free.

`--render-config` is the one input the runner cannot derive. A fixed build has its
render configuration compiled in and the runner will not read it, so the operator
declares it in a file whose bytes become the manifest's `configSha256`. That hash
verifies nothing by itself — it only says two trials were handed the same claim.
The claim is made to earn its place by being checked: the declaration must carry a
`graphics` object, and every field it declares must equal what the Menu recording
observed in its own identity, or the trial is not functionally eligible. Use the
same declaration for every trial in a comparison; an absent or settings-free one
blocks eligibility rather than defaulting.

## Host evidence is collected, never assumed

Hardware, OS, power and display come from macOS tools run once _before_ the
browser launches, so probing cannot contaminate the window. Anything a tool does
not return stays `null` and blocks ranking; no field is inferred from another.
Browser version comes from the live Playwright browser and the GPU adapter from
the report's own identity.

Quiet status comes from a series that covers the window, not a snapshot and not
two distant endpoints: one observation before the run, one after, and periodic
ones during it, with no stretch longer than the declared coverage gap left
unwatched. The series opens where the measured window does, after the provenance
sweep — hashing the build is setup, and a slow disk must not read as a stretch of
the run that nobody watched. A cadence slower than the coverage gap is refused at
the command line rather than producing an unrankable trial after five minutes of
GPU time. The runner's own
process subtree is excluded by pid, so the browser it started does not count
against it while a competing build or benchmark does.

Nothing else is excluded. `WindowServer` and `kernel_task` are shared by every
client of the machine at once, so their CPU can neither be charged to a competitor
nor credited to this trial: they are recorded in every observation, and one of
them running hot leaves the trial's isolation _unknown_ — which blocks ranking
with a reason that says so, rather than being quietly written off as the trial's
own presentation. Note too that `ps` reports `pcpu` as a decaying average over up to a minute, so the
series bounds sustained competing load and is not proof of instantaneous
exclusivity; a quiet verdict is admissibility to a comparison, never a physical
guarantee. `QUIET_HOST_POLICY` in `host.ts` holds every threshold and the shared
process list, and is archived with each run so a reviewer can disagree with it
instead of guessing. When isolation has to be established some other way,
`--host-evidence` records an external pointer alongside the series — it is
recorded for a human, and never flips the verdict by itself.

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
this pass can reach without a GPU: provenance mismatch, served-bundle and
shared-tree mismatch, a shared subtree linked inside a directory of emitted
artifacts, a manifest missing a required field, read-budget and malformed-size
refusals, the exit-code and
scenario-evidence rules, declaration-versus-recording disagreement, host coverage
and shared-process attribution, refusal to overwrite, the functional/ranking
split, and the storage key pinned against the real settings owner. The browser
seam is injected, so none of them start Chrome.

Actual browser validation is the orchestrator's, on the machine holding the GPU:
serve one fixed build at a time with the preview command its build README records,
then run the command at the top of this file with the next `--order` and a fresh
`--out`. Check `trial.json` for both verdicts before feeding any `run.json` pair
to the scorecard. Until a trial has been run that way, this runner has produced no
timing evidence at all.
