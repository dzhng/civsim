# Canonical heavy backward-action integration

This integrates the provisionally reviewed backward B action into the composed
heavy candidate. The [matched donor review](../guarded-backward-transfer/review.md)
still applies: modestly less wrong, with rigid upper-body response and crowded
passing steps unresolved. Integration is not final art acceptance. The engine
remains canonical; no gameplay state, simulation change or live posture selection
is introduced. Candidate presentation stays `null`.

## One authoring owner

The fitted `heavy-kit.blend` owns geometry. The existing
[motion author](../../../../../../packages/soldier-assets/bake/blender-heavy-motion.py)
reconstructs carry, loaded run, idle/ready and then guarded backward keys, followed
by one final export. The standalone backward recipe is superseded and removed;
its historical evidence belongs to its recorded commit revisions. Ready and
backward share the same offline two-segment leg construction and orientation
helpers. Rebuilding the backward action starts from ready, removes only its owned
previous action, and cannot accumulate the prior cycle's offsets.

The fixed 30 fps donor produces a one-second backward cycle with 0.916110 m
authored distance. This is the reviewed calibration, not a new engine speed.
The runtime-metadata lane owns any later stride binding; this pass only exposes
the new looping action for manual inspection.

## Source and export controls

`source-controls.json` compares canonical 401744a8, integrated output and another
full rebuild. All 37 editable mesh objects, rig and seven old source-action
curves/handles/interpolation are exact; the second rebuild preserves all eight
actions exactly. `integrated-controls.json` independently imports the GLBs and
confirms all seven old clips and bind rig are exact. The new backward clip is
exactly equal to reviewed B in `determinism.json`; all eight imported clips and
the full rig are exact across the repeated authoring pass.

All imported primitive fields except exporter tangents remain exact. The first
export changes 14 tangent scalars in primitives 0, 1 and 7, maximum absolute
difference 0.0001000166; its repeat also changes tangents in primitives 0 and 7.
No bytes are pinned back to a donor. Semantic source/clip repeatability is not
byte-identical GLB generation; pixel comparisons below are the separate visual
control for this particular exported candidate.

## Production verification

The existing heavy-kit scene keeps every previous snapshot and adds the complete
80-frame backward film. Its new helper follows the same frozen 30 Hz recorded
men-centroid vector trace, same camera, same crop and same distance-driven phase
as the reviewed donor. The trace now lives with the model fixture rather than
requiring an ignored script or current battle rerun. It remains explicitly not
proof of an individual man's self-propulsion or sim foot contact.

The first full capture completed all 355 snapshots / 1,597 checks with one
failure: two pixels in the old run contact sheet. All other 274 old snapshots
matched exactly; all 80 new backward frames repeated exactly, and no page errors
occurred. `full.json` preserves that failed status rather than reporting it as a
pass. `pixel-controls.json` proves all 80 backward PNGs are byte-identical to the
reviewed B donor, so its complete-motion critique carries forward unchanged.

The run sheet is 2560×16000. Rear views at frames 6 and 18 differ only at
(1549,4107): RGB (43,60,74)→(43,60,75), and (1551,11787): (78,86,81)→(78,86,80).
Both pixels lie on the rear mail. `run-pixel-0.png` and `run-pixel-1.png` show old
left/new right. `tangent-difference.json` records the changed exported scalars,
including three in mail primitive 7. With all other primitive fields and old clip
samples exact, this is consistent with exporter tangent rounding, but the exact
affected triangle/shader calculation was not traced, so that cause is not proved.

Author and root inspected both crops and saw no perceptible deterioration.
[Fresh crop review](fresh-crop-critique.md) likewise finds neither side clearly
preferable. The focused same-source repeat reproduced the first actual PNG
byte-for-byte (`run-sheet-repeat.json`, terminal 1 against the old two pixels).
Root's authorized scoped update then passed (`run-sheet-update.json`, terminal 0).
The final unfiltered standard run passed all 355 snapshots / 1,597 checks, with
zero differing pixels and no page errors (`repeat.json`, terminal 0). There is
no tolerance relaxation, tangent pinning or quality-upgrade claim. The 274 other
old baselines remain untouched; the backward film still exactly matches B.

## Review and changed-test ledger

Independent bundled Codex review found a real integration defect in the new
snapshot filter: passing `snapshotSelected` directly to `Array.some` forwarded
the numeric element index into its optional filter-list parameter. The explicit
single-argument callback fixes both full and filtered capture. The existing
selection test now also calls the backward capture helper with a null page when
an unrelated static sheet is selected; it must return without touching the page.
Temporarily restoring the defective callback made that test fail with the exact
`filters.some is not a function` error; restoring the fix passed both tests.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `selecting an existing static sheet does not access the travel page`, `web/tests/modelTravel.test.mjs` | Unrelated sheet selection skipped forward travel only. | The same selection also skips backward travel without accessing a page. | The new helper initially crashed on its filter callback; regression coverage preserves the existing selection contract. **your-regression** |
| heavy-kit scene snapshots | Existing 275 snapshots. | All existing snapshots plus 80 manually selected backward frames; no replacement or weakened tolerance. | Add the reviewed action's full production evidence without dropping old coverage. **moved** |
| heavy-kit `run-frames` | Old rear-mail values at two pixels. | One channel changes by one at each recorded coordinate; all other pixels exact. | Reviewed neutral export difference, stable on the same source; intentional baseline update, not a visual improvement. **moved** |

No unit stats, simulation assertions or gameplay behavior changed. The proposed
fixture-trace ownership choice was sent to root, which owns the global ledger.
Code shape consolidates the
authoring owner; the additional verification stays in the same heavy-kit world.

## Reproduction

Run from the repository root with isolated background Blender and a frozen Vite
server on 5271; serialize GPU use and finish baking before capture:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-motion.py
node packages/soldier-assets/bake/heavy-kit.mjs
node packages/soldier-assets/bake/heavy-kit.mjs --check
VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 SCENARIO_REPORT_JSON=../throwaway/backward-integration/full.json node web/scene.mjs heavy-kit --full
SNAP=run-frames VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 SCENARIO_REPORT_JSON=../throwaway/backward-integration/run-sheet-repeat.json node web/scene.mjs heavy-kit --full
UPDATE_SHOTS=1 SNAP=run-frames VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 SCENARIO_REPORT_JSON=../throwaway/backward-integration/run-sheet-update.json node web/scene.mjs heavy-kit --full
VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 SCENARIO_REPORT_JSON=../throwaway/backward-integration/repeat.json node web/scene.mjs heavy-kit --full
node --test packages/soldier-assets/bake/*.test.mjs
node --test web/tests/modelTravel.test.mjs
web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json
```

One-off source/import comparisons remain in ignored `throwaway`; their JSON
results are archived here. Reauthoring can perturb exporter tangents, so a future
export must rerun its actual image gates rather than inherit pixel identity.

Terminal CPU checks passed: all 13 bake test files, both model-travel tests,
TypeScript, targeted lint, bake freshness and whitespace checks. Production GIFs
and submitted states accompany the reports; complete PNG frames live in the
active heavy-kit snapshot directory. GPU adapter in the report is SwiftShader.
