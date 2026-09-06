# Whole-body mass study

Target: natural adult limb mass with a calf belly tapering into the ankle,
forearm mass tapering into the wrist, and a joined shoulder silhouette. Clothing,
lighting, facial microdetail and animation changes are excluded from this pass.

The original and candidate use the same production candidate scene, cameras,
neutral/deep-bend times, fixed1280×800 viewport and default SwiftShader adapter.
The paired [close sheets](wholebody-after-close.png),
[gameplay sheets](wholebody-after-gameplay-pitch.png) and enlarged
[body crop](wholebody-after-crop.png) have matching `wholebody-before-*` files.
Head, hand and both pronation detail sheets are also archived: the whole-body
rebuild changes the reduced mesh beyond the directly edited regions, so those
images must not be silently treated as unchanged.

Only eleven authored cross-section entries change: calf/thigh taper, forearm
belly and shoulder roots. The rig, bind positions, inspection clips, reduction,
weighting and export functions are byte-identical to22b0d87c. Blender rebuilt the
editable sculpt and runtime surface; the provisional output remains20,504
triangles and26 joints. Counts do not establish07 admission. No heavy-kit or
production catalog artifacts change, and retained anatomy would require kit
refitting/rebaking.

## Evidence boundary

[Comparison telemetry](wholebody-comparison.json) finds132,180 changed close-sheet
pixels and55,678 changed gameplay-sheet pixels outside caption rows. This proves
visible change, not anatomical improvement. Direct inspection sees fuller calves
and forearms; shoulder pits, smooth mannequin torso and joint transitions remain
unresolved. This is a candidate, not a fixed or accepted model.

The [original capture](wholebody-before-capture.json) passed; the
[candidate capture](wholebody-after-capture.json) failed only its six changed
snapshot comparisons. All weighted submission, frozen-repeat, alias and page-error
checks passed. No baselines were blessed. The authoring run passed manifold,
finite normalized four-weight and grip-tracking checks; maximum grip drift across
the three unchanged clips was3.79e-7m. The exact candidate bake `--check` passed.

Commands from this worktree root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-human-anatomy.py
node packages/soldier-assets/bake/human-anatomy.mjs
VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5397 SCENARIO_REPORT_JSON=../throwaway/wholebody-after.json node web/scene.mjs human-anatomy
node packages/soldier-assets/bake/human-anatomy.mjs --check
```

Source shape review finds no new owner, helper, runtime mechanism or contract;
the eleven replacements are delegated sculpting discretion. Independent CLI
review was attempted but failed because its configured model requires a newer
CLI. It did not pass.

## Independent verdict and controlled retry

Root's fresh reviewer retained the fuller limb direction with moderate confidence,
but rejected the enlarged shoulder roots with high confidence: dark angular
chest/deltoid notches made a plate-like boundary in front and three-quarter views.
Both bodies still have a vase-like torso. The fuller forearm exposed a narrow
elbow hinge. Head/hands appeared visually preserved; a rebuilt reduced mesh does
not justify a claim of identical geometry there.

The next source candidate restores all original shoulder cross-sections and
retains the leg/calf taper. Its upper-arm, elbow and forearm sections now form
one gradual transition rather than adding a belly below the old narrow hinge.
The rig and inspection owners remain untouched. The first trial is archived
as `wholebody-after-*`, not accepted or discarded from the evidence record.
The [controlled retry close sheet](wholebody-continuous-close.png),
[gameplay sheet](wholebody-continuous-gameplay-pitch.png) and
[body crop](wholebody-continuous-crop.png) have been captured, along with all four
head/hand/pronation detail sheets under the same `wholebody-continuous-*` prefix.
Main inspection sees the shoulder enlargement removed and a less abrupt neutral
elbow taper. Bent elbows still have a pronounced angular silhouette, and the
torso/shoulder anatomy remains visibly unfinished. There is no anatomy acceptance
claim.

[Retry telemetry](wholebody-continuous-comparison.json) records127,400 changed
close pixels and48,679 gameplay pixels versus the original outside caption rows.
The [capture report](wholebody-continuous-capture.json) again fails only six changed
image comparisons, with all other checks passing. Exact candidate bake check and
source diff whitespace checks pass. The final source diff is ten replaced
cross-section entries; no rig, inspection, weighting or runtime code changes.

## Final working-candidate decision

Root-arranged fresh critique prefers the retry as a modest limb-form improvement
with medium-high confidence: fuller calves, thighs and forearms retain taper,
with no clear new visible defect. Shoulder seams remain in both candidates;
elbows and knees still have simplified swollen or hose-like bends. Head/hands
appear preserved where visible; the side hand is occluded and cannot support a
visual preservation claim. Source review found no concrete correctness bug and
confirmed unchanged endpoints, rig and head/hand construction. Global remeshing
and reduction still preclude an exact head/hand geometry claim.

Retain the retry as the editable working candidate, not accepted anatomy. Root
must refit/rebake heavy equipment before judging contact or dressed motion.
No new architecture decision is introduced: cross-section sculpting is delegated
by08, and the existing candidate-only/budget/promotion rules remain unchanged.
