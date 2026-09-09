# Heavy motion composition

This integrates the reviewed stationary idle, shield-forward ready, and loaded
forward run into the fitted **heavy-kit** manual candidate. It is not final art
acceptance, protected-travel selection, or production roster promotion:
`presentation` remains `null`.

## Ownership and repeatability

The saved fitted Blender scene owns geometry. The existing
[motion recipe](../../../../../../../packages/soldier-assets/bake/blender-heavy-motion.py)
now owns composition: reconstruct fitted carry actions, apply loaded-run response,
then author idle/ready, and export once. Reconstructing carry first prevents
repeated runs from accumulating arm deltas. The two formerly standalone motion
recipes were removed; their formulas are not competing authoring entry points.
No procedural kit regeneration, geometry replacement, runtime IK, or tangent
pinning is involved.

From the repository root, with isolated background Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-motion.py
node packages/soldier-assets/bake/heavy-kit.mjs
node packages/soldier-assets/bake/heavy-kit.mjs --check
```

[Source controls](source-controls.json) compare the frozen fitted source, both
reviewed donor scenes, the composition, and two successive reauthoring outputs.
All 37 mesh objects preserve vertex positions, faces, weights, UVs, material
indices, and object matrices; bind bones preserve parents, matrices, and lengths.
All seven source actions match their owners' key coordinates and interpolation.
The source signature normalizes signed zero (`-0.0` and `0.0`); there is no
coordinate tolerance. The later review repeat also covers reuse of the existing
orientation helper and the clearer `action_signature`/`action_fcurves` names.

The root agent independently reauthored from the integrated candidate and
imported its export: the full rig and every clip match exactly. All primitive
fields except tangents also match. Eleven tangent scalars differ (five in
primitive 0, three each in primitives 1 and 7; maximum absolute difference
0.00010001659). This independently confirms action idempotence; that additional
export was not pixel-tested and carries no rendering-equivalence claim.

[Export controls](export-controls.json) independently compare imported clips:
`idle`/`ready` match the reviewed stationary donor, `run` the loaded-run donor,
and `walk` plus all three inspection clips the frozen fitted source. Every
imported rig and clip is exactly equal across both reauthoring repeats. Positions,
normals, UVs, joint weights, indices, and material definitions remain exact.

Blender re-export changes a few tangent scalar values: 14 in the integrated
export, 9 and 21 in its repeats, versus the original fitted GLB. These bytes are
not overwritten or silently pinned. This proves semantic source/clip
repeatability, **not byte-identical GLB generation**. Actual donor-image checks
are the separate rendering control.

[Run donor comparison](run-pixel-controls.json) confirms all 64 integrated
two-cycle travel PNGs equal the reviewed loaded-run donor pixel-for-pixel.
Together with stationary checks this is **188/188 exact donor images**. It
resolves the tangent uncertainty for this integrated export, not every future
Blender export or camera.

## Visual controls

[Stationary donor comparison](rest-pixel-controls.json): all 124 integrated
idle/ready frames match reviewed donor PNGs with **zero differing decoded
pixels**, despite the unpinned tangent differences. The fixture samples a fixed
six-second authored loop at 31 inclusive phases in two views; it asserts that
duration rather than silently changing its cadence. The repeated endpoint is
checked pixel-exact and omitted from the 30-frame, 200 ms/frame review GIF.

Chronological contact sheets read left-to-right, top-to-bottom; the unused final
cell is empty: [idle side](idle-side-chronology.png),
[idle oblique](idle-oblique-chronology.png),
[ready side](ready-side-chronology.png),
[ready oblique](ready-oblique-chronology.png).
The integrated frames retain the donor's planted stance, low ordinary carry,
and shield-forward ready silhouette. Existing donor limitations remain; this
pass does not resculpt hands, tune the pose, or claim the run's final realism.

The initial full-scene attempt captured the sheets and all stationary frames,
then failed because the sheet-caption DOM node disappeared before restoration.
It did **not** complete travel and is not a full-pass result. Concurrent source
formatting/re-export checks make a development reload plausible, but the first
run did not record navigation history and the cause remains unconfirmed.
The caption remains a strict owner requirement; no optional chaining masks loss.
Further capture runs freeze source writes and check its presence after each
stationary set/render.

The conventional `UPDATE_SHOTS=1` rerun completed all 275 snapshots and all
1,357 scene checks successfully. Its [raw telemetry](full-update-telemetry.json)
also preserves a failed *extra scratch* assertion that expected exactly one
initial navigation: there were two startup navigations 93 ms apart, at
16:02:20.816 and 16:02:20.909 UTC, before captures, and none afterward. That
diagnostic assumption was false; the production gate was not weakened.
The [initial interrupted report](full-first.json) remains distinct.

The authoritative [standard full repeat](full-repeat.json), with no update
flag, passed **1,357 checks / 275 snapshots, zero failures**. Every snapshot
matched exactly; all pre-existing coverage remains. The
[snapshot change ledger](snapshot-ledger.json) records every test and before/
after hash: 80 unchanged, 71 intentionally updated (seven sheets and 64 run
travel frames), and 124 new stationary frames. Review-only GIFs include
[idle](idle-side.gif) and [ready](ready-side.gif).

Independent merged-tree verification at commit `401744a8`, completed
2026-09-07 16:36 UTC, also passed all 1,357 checks and 275 snapshots with no
update flag or differing pixels. The production route was
`http://localhost:5174`, using bundled Chromium/SwiftShader; the raw report is
[merged-root-full.json](merged-root-full.json). The bake check, all 13 bake test
files, and web typecheck separately passed on that merged tree.

The non-blocking Preview checkpoint showed ready, formation, and the medium
march grip alongside ongoing work. After more than five minutes without a
visual verdict, Preview was closed and work proceeded on the recorded evidence:
retain the heavy composition as a provisional integration, not final art or
user approval. The medium comparison did not earn naturalness acceptance.

## Review and choices

The root agent independently reviewed the composition and harness. Naming and
duplicate-orientation cleanup were applied and repeated source/clip controls
passed afterward. Local `codex review` could not start because the installed CLI
does not support its configured `gpt-6-astra` model. A later independent review
using the already-installed bundled CLI v0.153.4 completed successfully with
configured defaults: no actionable defects; syntax, bake, bind rig, walk, and
inspection checks passed. It explicitly did not rerun the browser gates.

The main reviewer inspected all seven changed sheets, including all 25 run
phases in four views at readable cropped scale. Fresh unprimed CLI visual
review (session `01a07ca5-b031-7023-a468-8b9738b5342e`) found a coherent
provisional assembly, with retained limitations: limited chest/shoulder/shield
response during run (medium-high confidence), scabbard/sandal silhouette
overlap in right-side run frames 2–4 and 14–15 (high confidence, not proof of
penetration), and jagged heel-band/tab contours in ready-feet rear/side views
(high confidence). The main reviewer also sees the latter two. Exact donor
pixels and unchanged fitted geometry classify these as retained limitations,
not integration regressions. They remain open art work; this pass does not
divert into finger or strap sculpting.

The key integration choice is one source-preserving deterministic recipe, not
three saved motion owners imported at runtime. Keeping the old inspection and
walk actions exact narrows this pass to the three reviewed motions. The new
stationary verification supplements every pre-existing heavy-kit snapshot; it
does not replace the travel or close-detail gates. Its caption-free crop matches
the original donor films and does not hide model geometry.

Additional verification discretion: stationary frames run before existing
travel, use the two donor cameras, and assert six-second duration; Fcurve
signatures normalize signed zero only; imported clip equality is independent.
There are no new consumer APIs, gameplay states, selection rules, or runtime
binding decisions.

Focused checks passed:

```sh
node --test packages/soldier-assets/bake/*.test.mjs
node packages/soldier-assets/bake/heavy-kit.mjs --check
web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json
web/node_modules/.bin/oxlint web/scenes/models/_heavy-rest.mjs web/scenes/models/heavy-kit.mjs
git diff --check
# From web/, with the local Vite server running:
VERIFY_GPU=1 VERIFY_URL=http://localhost:5293 SCENARIO_REPORT_JSON=../throwaway/composed/full-repeat.json node scene.mjs heavy-kit
```

The bake suite passed all 13 test files. Simulation code and timing are
unchanged; no simulation behavior test was redefined or re-blessed.

Change size (excluding generated assets and evidence): authoring production
code +183/−246 lines, including deletion of both superseded recipes; scene
verification +95/−2 lines. Evidence documents the changed tests separately from
unchanged simulation behavior.
