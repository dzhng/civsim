# Shared base endpoint packing

Implementation checkpoint from `406f38fd`; matched hardware comparison remains
open. No speedup, visual change or
budget acceptance is claimed.07 stays open.

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
not detailed model quality. Hardware timing remains pending; the first-pair art
capture has priority. The separate Blender motion diff was not part of this pass.
