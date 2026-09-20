# TypeGPU impostor derivation — integrated for evaluation

Candidatefc446726 compiles actual typed GPU derivation from6 soldier floats plus
a48-byte view block. Camera-only audience refresh no longer republishes per-soldier
records. Root's fixed-build GPU check has no validation/page errors:786 probes on
8x8 and564 on6x4, plus a second camera from a uniform-only write. No non-boundary
tile differences occur in these probes. Exact bisectors choose different tiles in
32/5 cases respectively (dot margin at most2.22e-16); the worker's tolerance gate
accepts these, so its passed flag is NOT unconditional tile equivalence.

The actual rendered source control, canonical projection with published offline
atlases and1 sample, passes all12 existing cases for classes0/3/6: no coverage
mismatches or RGB differences over the unchanged1/255 threshold. No timing claim.
Broader moving camera/LOD/image and net-performance acceptance remain open.

The initial `packingEqual` field returned a CPU oracle. Correction6b9403f9
(integrated62ec8728) removes that compatibility path: an opt-in diagnostic reads
the layer's installed GPU state/view through the same typed derivation used by
its vertex shader. Normal layers allocate no diagnostic storage/readback resources.
Both1x and4x physical controls pass12 cases with1101/1296 fields exactly equal to
Three's instance attributes; remaining values meet the declared float bounds.
No faults, nonfinite records, duplicate/tied tiles, page errors or warnings occur
in these physical cases. RGB/coverage gates remain unchanged; this does not erase
the separate exact-bisector disagreement above. Reports are
[1x](actual-record-render.json) and [4x](actual-record-render-4x.json).

Fixed actual-game builds020d8db8 and62ec8728 preserve15560 soldiers at the canonical
tick30/hash at three tactical zooms, with current presented camera/depth and clean
resize/disposal. The first captures differed only in the minimap rectangle:
3438–6729 pixels, zero outside the minimap. Unprimed critique independently found
that mismatch and no visible battlefield differences. `battleLoop` updates the
minimap on its200ms HUD cadence. Waiting500ms after camera settlement yields
**pixel-identical full2880x1800 frames** at all three zooms, including the HUD.
Both initial and settled reports are retained; no image region or threshold was
excluded. These are fixed-state correctness captures, not moving-camera or timing
acceptance. Main candidate115 and lab166 tests passed after integration.

Scope correction: the48-byte bound is the layer view setter/final audience refresh,
not the whole moving-camera path. `CrowdViewState.matches` compares the actual
frustum and projection, so a camera move calls `audience.reproject` and republishes
state for the regrouped audience. Expensive billboard derivation moves to the GPU,
but CPU preparation and state upload still scale with population. Measure the
complete scene frame, never infer a constant-time camera from the setter test.

A supplemental continuous camera sweep makes60 requestAnimationFrame-driven
camera updates per leg through tactical, pan, wide, horizon and return views.
Both builds retain the canonical tick/hash/population, present the final requested
camera, resize and dispose without page errors. Endpoint full-frame differences
are98,105,1,0,0 pixels respectively (max channel gaps100,29,1,0,0). Some differences
are in HUD or screen-edge content; these remain diagnostic residuals, not a passed
full-frame equivalence gate. The original tactical settled captures above are
still exact. This held-state sweep neither measures smoothness nor replaces the
five-minute live benchmark. Reports are in [camera-motion](camera-motion/checks.json).
