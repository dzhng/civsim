# Shared base endpoint packing

Implementation checkpoint from `406f38fd`; matched hardware comparison is now
recorded below. No cadence improvement, visual change or budget acceptance is
claimed.07 stays open.

When the base source and destination are the same clip-sample object, the packer
copies its already encoded four words. Clip lookup, key selection and fraction
rounding occur once. Distinct samples, frozen sources and upper-body composition
retain their existing path. This uses no cache, retained storage or new public API.
It is the base-only implementation of the earlier
[same-lane diagnostic](same-lane-packing.md).

The two added tests compare complete prepared frames for shared versus separate
endpoint objects around an authored STEP key, across clamped endpoints, blend weights,
frozen neighbours and upper-body exits. Invalid shared clips, phases and weights
still reject preparation; a subsequent retry decodes the retained committed frozen
pose correctly. These are equivalence tests, not bug regressions: the first test
passed before and after the change. No existing expected behavior changed.

Focused playback/timeline/mounted/raw-palette/replay suites pass51 tests and the
TypeScript check passes. Initial sparse-checkout failures were missing fixture and
generated wasm declarations; adding the tracked fixtures and linking the existing
wasm output resolved them without code changes. No Blender, browser or GPU ran.

Shape review retains one packing owner and an identity-only branch. Independent
parent review found the production branch sound and requested a real interior
key in the equivalence fixture; that correction also exercises a STEP mask.
The configured CLI review failed because Codex0.144.4 cannot run the configured
model; the parent supplied the read-only fallback. The implementation makes no
architectural choice beyond the explicitly
delegated exact endpoint reuse; test-case selection is local verification discretion.

Integration at `bd0560ff` independently repeated all51 focused tests and the full
TypeScript check successfully on the main feature worktree. The focused command is
`bun run --cwd web test tests/playbackPacking.test.ts tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts tests/rawPosePalette.test.ts tests/battleModelReplay.test.ts`.
An initial direct Node invocation did not load the project's Vitest aliases and
failed before executing tests; it is not a behavioral failure or passing evidence.
The repository's configured runner required no source or environment changes.
[Canonical browser regression](settled-base-temporal.json) subsequently passed
all675 checks with no page errors and exactly zero changed pixels in all40
existing images. It used bundled Chromium/SwiftShader,1280×800 and the existing
action-replay, pose-palette and raw-pose-palette scenes, without re-blessing.
Those unchanged images retain the prior
[temporal visual review](frozen-retirement/review.md); they prove transport,
not detailed model quality. The separate Blender motion diff was not part of
this pass.

## Matched hardware comparison

The bounded A/B/A at `3e3181f8` compares the original packer, integrated exact
endpoint reuse, then the original again. Source hashes in the environment records
distinguish the temporary A source from the committed B source; B was restored
exactly afterward. All three runs completed with33 checks, four cadence failures
and no page errors. No result was discarded or repeated to obtain a pass.

Raw reports and machine-wide process samples:
[A before](settled-base-hardware/a-before.json),
[environment](settled-base-hardware/a-before-environment.json);
[B](settled-base-hardware/b.json),
[environment](settled-base-hardware/b-environment.json);
[A after](settled-base-hardware/a-after.json),
[environment](settled-base-hardware/a-after-environment.json).
The [derived summary](settled-base-hardware/summary.json) uses sorted sample
indices floor(N×0.5) and floor(N×0.95), not interpolated quantiles.

The existing `battle-model-budget` scene used hardware Chrome,5120×2880,
30,000 mounted bodies,67 joints, four influences,1024px maps and180 measured
frames per row. Detail was subdivisions[2,1,0], jointCopies8 and
keySubdivisions2; camera was gameplay/close. Across corresponding rows, assets,
camera, dimensions, main/shadow tier histograms, palette demand, draw-call count
and texture size match exactly. Each timed row has180 unique GPU frame IDs,
all corresponding to sampled CPU frames. Advanced simulation ticks differ
because capped wall-time catch-up is not a fixed pose-history replay.

CPU frame median/p95, milliseconds:

| Workload | A before | B | A after |
| --- | --- | --- | --- |
| Steady control |11.335 /18.915|11.290 /18.800|11.460 /18.465|
| Steady timed |11.840 /19.580|11.050 /19.025|11.285 /18.635|
| Interruption control |14.265 /25.060|14.355 /23.640|13.985 /24.905|
| Interruption timed |15.000 /24.160|14.550 /24.935|15.190 /24.560|

Steady upload medians decrease modestly in B; interruption upload and full-frame
tails are mixed. Control cadence p95 stays around50ms and timed cadence p95
around33.335ms: the latter still fails33ms and must not be rounded into a pass.
Timed GPU-queue medians stay around23.5–23.9ms; these include CPU submission
gaps and must not be added to CPU frame time. This is limited cost evidence,
not a demonstrated frame-rate improvement or an accepted art envelope.

This task's modeling lanes held rendering during the bracket. Process samples
still show WindowServer and unrelated Chrome activity, so task-local exclusion
does not establish an idle machine or clean causal attribution. No unrelated
application was stopped. Retain the simple exact reuse already covered by CPU
and pixel-equivalence checks; do not grow another cache from this mixed result.

Evidence-only closeout: shape review adds no runtime owner, API or test policy;
diff review checks raw failures against the summary and source restoration;
documentation replaces the stale pending marker. Choice audit finds no new
architecture decision beyond the already delegated exact endpoint reuse and
bounded measurement controls. The33ms gate remains unchanged.
