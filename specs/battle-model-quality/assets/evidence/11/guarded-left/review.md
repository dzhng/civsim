# Guarded left step — bounded source smokes

Working authoring candidate, not visual acceptance or runtime binding. The target
is conscious leftward stepping while the shield stays toward the threat: the
left foot leads, the right closes without crossing, pelvis carries weight across
supported feet, and equipment follows connected arms. Shield and sword sides
are not mirrored. Root owns global spec status.

## Calibration boundary

The ignored `throwaway/lateral-measure` Rust executable uses unchanged `Sim`
with seed 59: two ten-man HeavySword units, five files, anchors (0,0)/(18,0),
facings 0/pi, opposite teams. Unit 0 receives running pace and a Move order to
(0,40). `engine-trace.json` records every tick through 120 (1/30 second).
Ticks 60–108 remain guarded, nonrouting and nonincapacitated. In the interval's
initial-facing basis, mean men-centroid travel is 0.760776176 m/s left and
0.201747145 m/s backward. This is observed centroid travel, not individual
self-propulsion or constant speed.

The initial clip isolates the leftward component: 0.8-second cycle at that mean
leftward speed, 0.608620941 m per cycle. Ground telemetry prescribes pure +X
source-axis leftward motion; it does not claim support lock against the omitted
backward component or the engine's changing direction/speed. A production
travel film must label this distinction explicitly.

## Source smoke

The existing heavy-motion owner adds `guarded-left-walk` from ready, rebuilding
from original local controls each frame. It keys ordinary poses at 30 fps;
there is no runtime IK. The source candidate remains under ignored throwaway;
the canonical composed blend/GLB and live selection are not changed.

All 37 editable meshes, rig and eight existing source actions are exact against
1de3c162 (`source-controls.json`). All eight imported old clips remain exact;
reauthoring preserves the full imported rig and all nine clips exactly
(`import-controls.json`). Re-exported primitive differences are tangents only,
not a byte-identical GLB claim.

Quarter-frame sole samples have minimum Z -1.037 mm and minimum sole-center
left/right separation 181.8 mm. Flat-support phase .10–.52 has at most .398 mm
sole-center X drift under prescribed pure-left translation. These numbers do
not prove full-body support, nor exclude all mesh intersections. Nine sampled
equipment/body BVH surface tests report no intersections; containment and
between-sample contacts are outside that check.

Initial production pose/control smoke passed 16 images / 33 checks with exact
immediate repeats and no page errors (session 82648). All frames were inspected.
The yaw-zero view was incorrectly captioned front but actually shows the rear;
the second view shows the rear quarter. World-only pixel differences against
matched ready are 26,638–46,926 pixels, confirming actual pose changes.

Actual opposing front smoke captured eight images / 17 checks (28589), but
briefly overlapped an engine diagnostic after conflicting queue messages. It is
provisional inspection material only, pending a serialized repeat. All eight
images were inspected: shield coverage is retained, with no obvious detached
gear. Broad-to-close stance change is pronounced and the trunk remains upright.
The small pelvis sway may be insufficiently timed/amplified over the supporting
foot; sole grounding alone cannot establish weight transfer. Root subsequently
rejected this source as described below. No visual acceptance claim is made.

## Rejected initial transfer and revised source

Root inspected the ordered 16-pose sheet and actual opposing front candidates.
The original is rejected before full film: all 66 nominal single-support
quarter-frame samples place the pelvis-head X projection outside the supporting
sole's X bounds, up to 310.95 mm. `rejected-ground.json` keeps world root travel
separate from local pelvis position. This is a pelvis proxy, not true COM or
force balance. The original source is preserved in ignored
`throwaway/heavy-lateral/initial/heavy-kit.blend` and its GLB alongside it.

The revised source keeps measured speed fixed but uses a .6-second / .456466 m
cycle with foot anchors ±.18 m and 75% nominal support. Width is the anchor gap
plus/minus half a stride, not a full stride added to both feet. It keys a lower
pelvis transferring laterally and world-axis trunk lean; no hands/gear changes.
All eight old source actions/37 meshes/rig remain exact on the new rebuild.

The revised pelvis proxy is outside sole X bounds at 32/34 single-support
samples, maximum 39.16 mm. Minimum foot-center X separation is 123.62 mm.
This reduces the original large support gap but does not establish supported
motion. Cadence rises from 2.5 to 3.33 placements/s; the pelvis proxy's world X
speed spans -.405 to +3.577 m/s despite constant root +.761 m/s. Its larger,
rapid local transfer could read as a brisk shuffle or lurch. Floor penetration
also regresses from 1.037 to 3.225 mm between 30 fps keys. Both are open, not
metrics to hide before inspecting motion. `revised-ground.json` preserves the
raw samples; nine equipment surface checks remain clear.

Revised smoke completed serialized after the engine released the GPU: 40 images
/ 81 checks, exact immediate repeats, no page errors (session 80932, terminal 0).
Ten sequential phases from actual front/rear and matched ready controls were
all inspected. Candidate GIFs show two .6-second cycles at the authored timing.
Ready controls are pose comparisons, not a matched ready-cadence comparison.
The browser closed and GPU ownership was released after the terminal result.

Fresh read-only CLI critique completed terminal 0, session
`01a07d04-fdc5-7822-a395-0b8f6ebaded7`; its complete verdict is archived in
`fresh-revised-smoke-critique.txt`. It rejects the revision before fuller motion
testing: weak whole-body loading at phases 0–.3, pinched/inward-knee recovery at
.5–.7, unclear heel/toe loading, and a rigid shield/arm assembly. No confirmed
equipment detachment, foot intersection or sliding was claimed. Main author
inspection agrees on the pinched stance and insufficient upper-body response.
Neither smoke establishes world-travel foot locking or full-motion acceptance;
the support-proxy improvement does not override the visual rejection.

## C: smoother transfer, wider recovery base

C retains .6-second cadence and measured speed, widens ankle anchors to ±.22 m,
and replaces asymmetric pelvis keys with a ±.065 m sinusoid. This trades a
wider opening for a less pinched recovery; it does not accelerate the cadence
to hide the support problem. The whole pelvis/trunk shifts 28 mm forward after
the initial C body lean produced sampled shield/thigh surface contact. Changing
the knee pole alone did not remove that contact. Final C keeps an outward knee
pole, coordinated trunk lean/compression and the original hands/equipment.

All eight old source actions, 37 editable meshes and rig remain exact. C's
prescribed pelvis-proxy world speed is +.094 to +1.428 m/s, without B's reversal
and spike. Minimum sole-center X spacing is 203.6 mm and minimum sole Z is
-.636 mm. The single-support pelvis-head projection lies outside sole bounds
at all 34 samples, by up to 201.2 mm: this is a substantial remaining diagnostic
gap, not proof of COM or force balance. Nine equipment/body surface samples are
clear; no between-sample or containment claim follows. Raw samples are in
`c-ground.json` and `c-contact-smoke.json`.

Serialized C capture completed terminal 0 (74469): 40 front/rear candidate and
ready-control images, 81 checks, exact immediate repeats and no page errors.
All poses were inspected; browser closed and GPU released. The narrow gather
at phases .5–.7 remains the author's concern despite clearer trunk tilt.

Fresh read-only CLI review completed terminal 0, session
`01a07d0f-9130-7ee3-a181-be3d1601f910`, with actual image payloads in its
transcript. `fresh-c-smoke-critique.txt` records its moderate-confidence verdict:
credible enough for fuller motion testing, not visual acceptance. It sees a
coherent open/transfer/gather sequence and receiving-leg asymmetry, while
retaining the narrow gather and weak loaded settling as unresolved. Parent
inspection controls whether a full prescribed-travel film should proceed.

Parent cleared the frozen C source for a moving-world test. Capture 93469
completed terminal 0: 48 frames / 149 checks, front and oblique, 20 Hz through
two .6-second cycles. The shared absolute-time travel helper now accepts an
optional angle offset; its default keeps existing forward travel unchanged.
The new signed-left/facing-preservation test failed on the old helper and all
three focused travel tests passed after the minimal change. Production capture
checks pin signed left translation, unchanged facing, intended clip/phase,
unchanged route clock, exact repeated frames and out-of-order seek. Browser
closed and GPU released. `c-travel-submission.json` preserves actual submission
states. This remains prescribed pure-left travel, not the full engine vector
trace or a self-propulsion claim.

All 48 frames were inspected by the author. Fresh read-only CLI review completed
terminal 0, session `01a07d16-a96d-7d80-85d1-3ab2c73e2e5a`; the full verdict is
`fresh-c-travel-critique.txt`. It provisionally retains C as a directional
authoring candidate: noncrossing step order, nearly anchored support feet and
coherent pose wrap. It retains moderate upper-body stiffness, low/skim-like
trailing-foot recovery and a narrow gather as visible limitations. Author
inspection agrees; this is not runtime acceptance. The review judged complete
image sequences, not live playback. GIFs encode actual 50 ms frame timing;
their world-position restart is separate from pose-wrap continuity.

## Decisions and preservation boundary

The studied clip is manual-only. Left/right equipment ownership and the engine
state vocabulary are unchanged. The author isolates the measured trace's left
component deliberately; later runtime binding needs an honest travel contract,
not a new gameplay state to accommodate the art. C's modest recovery widening
and smooth pelvis transfer are retained together; closer proxy alignment was
rejected when it required a conspicuous local speed spike. The 201 mm proxy gap
remains diagnostic evidence, not hidden by this visual decision.

Guarded actions share ready-based setup and muted-NLA finalization in the
existing Blender owner. Their motion curves remain separate authored clips.
The shared travel helper separates movement direction from threat facing only
for review fixtures. No scratch probe or scratch screenshot baseline is a
production gate. Parent owns global documentation and canonical promotion.

Source SHA-256 identities (Blender 5.2.1 LTS; captured C predates the lifecycle
refactor, whose source controls/imported clips are checked separately):

| Source | SHA-256 |
| --- | --- |
| Control blend, 1de3c162 | `a3cf45189072758f5ed626b88ec50f1d01fc59e18d3c331097d2377ae0500531` |
| Rejected initial blend | `abc898b9b2328b96d2bbd9987d526d03feb17e572cca7946dafa0315bfcbb794` |
| Rejected B blend | `8074f096d35dfaaf6f3a43fc00f6c658bca4e38b6aadcf58d7bb5b669fbd5d63` |
| Captured C blend | `689451af205fbe6dff24ba8266d92162936f76bf35f3c897ac2e237566434275` |
| Captured C GLB | `c2f96b6137df4fba48c14733a4d6eb985a7f3054ff71a28e68b5f89f32ac7bec` |

The [complete C travel frames and GIFs](c-travel/) are durable visual evidence;
[rejected B strips](rejected-b-smoke/) retain the earlier rejection. JSON checks
record what was run, not a transferable baseline-acceptance rule.

Pass review: shape cleanup shares the guarded lifecycle; `c-refactor-source-controls.json`
proves all nine source actions/37 meshes/rig exact and
`c-refactor-import-controls.json` proves imported rig/nine clips exact after
reauthoring. Independent code review 40974, session
`01a07d1e-c3b6-74e0-80d7-2b0cdb82fadf`, completed terminal 0 with no actionable
correctness or maintainability defects in the manual-only scope; all three
focused travel tests passed independently. No visual/GPU reproduction was
claimed by that code review. Global documentation/linkage remains parent-owned
for integration; this leaf is not a declaration that slice 11 is complete.

## Local reproduction

```sh
(cd throwaway/lateral-measure && cargo run --quiet --manifest-path Cargo.toml)
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-motion.py -- --source throwaway/heavy-lateral/control/heavy-kit.blend --output throwaway/heavy-lateral/candidate
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/lateral-source-controls.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/lateral-ground.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python throwaway/lateral-contact.py
node throwaway/bake-lateral.mjs
VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 node throwaway/capture-lateral-smoke.mjs
VERIFY_GPU=1 VERIFY_URL=http://localhost:5271 node throwaway/capture-lateral-travel.mjs
```

The smoke command captures C's actual front/rear poses; the travel command
captures its prescribed pure-left front/oblique film. Both use exact repeats.
Scratch measurement/capture probes stay in ignored throwaway; the durable
authoring owner is the existing bake recipe.
