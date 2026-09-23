# Measure terrain pixels at their owner

City cards and their shadows are not terrain. Color coverage and named terrain
features now read the actual campaign canvas at the same frozen camera. The
composed screenshot still owns map structure, real-map alignment, labels/cards
and regression images. All numeric floors and independent owner controls remain.
The existing battle input check already uses canvas export for this distinction.

The prior southern crop measured0.545 coverage because it counted bronze cards
and their shadows as ground. Direct canvas reads measure0.8706. All three feature
crops match the composed image exactly outside measured card influence:15,790,
45,818 and22,353 compared pixels, respectively. The complete page is pixel-identical
before/after canvas export, with no camera/layout/material mutation. See
[crop isolation](crop-isolation.json) and [capture proof](capture-proof.json).

The first whole-frame comparison incorrectly excluded only the top60 pixels:
remaining differences outside card influence were confined to rows60–97, where
the topbar casts its shadow. Canvas export correctly excludes that DOM paint.
The actual terrain feature crops begin below251 and have zero such differences.

Visibility and opacity hiding were rejected as measurement mechanisms: both
restore103,689 changed card/shadow pixels despite stable layout, fonts and computed
styles. Their outside-world pixels are exact. This is a recorded browser repaint
limitation, not a reason to weaken restoration tolerance or change production CSS.
Canvas export avoids the mutation entirely.

The corrected LOD run has42 passing checks and only five existing screenshot
mismatches, with exactly the same mismatch counts as before this verifier edit.
Source classification controls, composed structures, alignment, city/army cards
and label-owner negatives stay intact. Independent review finds no capture timing
or coordinate defect; the fixed scene uses DPR1 backing pixels. The diagnostic
absent-olive image control fails the unchanged floor; that is classifier evidence,
not a substitute for a production material regression test.

## Changed checks

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Regional named terrain crops, campaign-lod | Page pixels: north0.681, central0.5713, south0.545; south failed0.55 | Canvas pixels:0.8656/0.8296/0.8706; same0.55 floor and relief/dark-feature floors | Removes DOM card/shadow contamination without recoloring land. **moved** |
| Rome-close natural ground, campaign-lod | Page coverage0.7462, floor0.42 | Canvas coverage0.8635, floor0.42 | Measures terrain at its owner; UI retains separate checks. **moved** |
| Selected army/city natural ground, campaign-lod | Page coverage0.7442, floor0.42 | Canvas coverage0.8606, floor0.42 | Same measurement correction with selection active. **moved** |

No production renderer, game state, classifier or threshold changes in this pass.
Baseline reconciliation is a separate integration checkpoint.
