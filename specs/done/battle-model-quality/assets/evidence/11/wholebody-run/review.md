# Whole-body loaded run study

This is an isolated run candidate, not live appearance promotion or completed
locomotion. It preserves the combined heavy's fitted mesh, skeleton and every
non-run clip. The exact reviewed editable scene and export remain in
`/Users/david/dev/game-heavy-wholebody-run/throwaway/wholebody-run/source/`.
The [source controls](source-controls.json) identify the frozen input and output;
the reviewed GLB SHA-256 is
`5ff989fc1d868e9292a0bb7465b7edef94fae84486572a19f8f3db8868b06e20`.

The [canonical motion recipe](../../../../../../../packages/soldier-assets/bake/blender-heavy-motion.py) makes the support stride asymmetric around the
hip: landing comes closer beneath the body and push-off reaches farther behind.
Support still moves backward at the authoritative prescribed speed, and the
cycle duration is unchanged. This permits the knee to compress the body after
landing instead of lifting it immediately. Earlier heel lift, recovering knee
flexion and delayed trunk/arm response complete the study. Fine hand anatomy,
runtime IK, gameplay movement and the other actions are outside this change.

## Ground and body evidence

The [imported control comparison](import-controls.json) preserves the exact bind
rig, positions, normals, topology, UVs, weights, materials and all six non-run
clips. Small tangent rounding differences remain on re-export; this is not a
byte-identical export claim. [Repeated authoring after recipe relocation](repeat-controls.json)
reproduced all animation and rig samples while tangent rounding still varied.

The [body trajectory](body-summary.json) samples imported production local tracks.
The original pelvis rose immediately after contact. This candidate moves from
0.850 m at touchdown to 0.827 m at phase 0.125 before rising into push-off; its full
vertical range is 9.6 cm against the original 15.8 cm. This is an anchor measurement,
not a whole-body center-of-mass estimate or a visual acceptance rule.

[Original](ground-original.json) and [candidate](ground-candidate.json) foot data
use the actual imported weighted sole vertices, production local interpolation
and prescribed world travel at eight substeps per authored frame. Both retain
the historical 0.08–0.22 phase window for direct comparability. The candidate
starts heel lift at 0.18, so the additional [equal flat-window comparison](foot-summary.json)
reports 0.08–0.18 for both. Forward sole-center drift increases from 0.595 mm to
1.040 mm; deepest between-key floor penetration increases from 2.63 mm to 3.43 mm.
Maximum recovering minimum-sole height increases from 17.4 cm to 38.0 cm. These are
explicit tradeoffs; this study does not claim improved foot locking or certify
the stronger recovery as natural.

The [equipment probe](contact.json) finds no sampled sword/body, sword/clothing,
sword/shield, sword/helmet, shield/body, shield/clothing or shield/sole surface
overlaps across 49 half-frame samples. The probe tests modular surfaces, not
containment or the whole runtime mesh. It cannot establish a visually convincing
grip, pressure, or absence of intersection between samples.

## Production review

The existing production travel fixture owns the fixed 1280×800 viewport,
1024×640 crop, cameras, daylight, 3.23 m/s prescribed travel and 0.8 s cycle. Both
views contain two full cycles at 20 fps using bundled headless Chromium and
SwiftShader. [Capture checks](capture/checks.json) record 197 passing checks,
no page errors and all 64 snapshots repeating at zero pixel difference. The
[pixel comparison](pixel-diff.json) proves all 64 frames changed from the
canonical source; distance is diagnostic, not a quality score.

- [Side loop](capture/travel-derivatives/run-side.gif)
- [Oblique loop](capture/travel-derivatives/run-oblique.gif)
- [Chronological strips](motion-review/): every frame was directly inspected,
  alongside the whole-context originals in [capture/](capture/).

Direct review finds less forward reaching and less bounding, with a clearer
loaded landing and trailing push-off. Torso and sword carriage remain restrained,
and the shield conceals much of the knee and hip response. The first isolated
iteration was rejected because it increased vertical bounding; only the revised
candidate is represented by the captured evidence here. Fresh unprimed review
prefers this candidate with moderate confidence: clearer heel recovery and
forward body participation, with stiff chest/shoulders, a rigid forearm and
occasionally exaggerated rear-shin motion still visible. Main-agent inspection
covered all 64 frames and found no concrete recipe defect. These judgments support
retaining an intermediate candidate, not calling loaded locomotion finished.

The local Codex CLI review was attempted but could not run because the selected
model requires a newer CLI. Independent main-agent review supplied the fallback.
Its shape review moved the durable authoring recipe into the bake module and
kept the one-off capture/contact drivers in scratch storage. Documentation keeps
source controls, numerical measurements and the limited visual verdict distinct.

## Reproduction

The [composition record](../composed-motion/review.md) owns current reproduction.
The one canonical recipe reconstructs fitted carry before adding the loaded
response, so reauthoring cannot accumulate arm offsets from an earlier run.
The isolated study's capture/contact drivers and frozen exports remain in its
local worktree for historical comparison.

No Rust changed; the existing built WASM was reused. No active baseline, catalog
binding, fitted source or production motion recipe is changed by this commit.
The integrating agent owns source promotion and the parent spec's evidence link.
