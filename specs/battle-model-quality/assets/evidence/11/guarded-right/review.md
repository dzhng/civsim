# Guarded right step — manual source study

Provisional study, not final locomotion or runtime selection. The independent
smoke and moving-sequence reviews retain the readable protected side-step while
leaving crowded recovery, restrained upper-body load response and actual support
quality open. No equipment side is mirrored; the original left shield and
staggered ready guard remain attached to their existing rig hierarchy.

## Calibration and evidence boundary

[The engine trace](engine-trace.json) records every tick and soldier position in
the unchanged seed-59 scenario: ten heavy swordsmen face another ten at 18 m,
with a running move order toward `(0,-40)`. The interval ticks 60–108 remains
guarded, nonrouting and nonincapacitated. Initial-facing projection gives a
centroid average **0.9253140324024038 m/s rightward**, with a separate
**-0.27586349907017566 m/s forward** component. Sampling is the engine's actual
float32 timestep, approximately 1/30 second.

The fixture isolates that rightward average at fixed facing; it does not replay
the backward component, changing facing, acceleration or individual trajectories.
Neither centroid nor per-body displacement proves self-propulsion. The authored
0.6-second cycle therefore represents 0.5551884194414423 m of prescribed travel,
not a new engine pace or gameplay state.

## Source and preservation

The existing heavy-motion recipe owns the new action and reuses guarded action
lifecycle, orientation and offline supported-leg construction. It starts from
the saved fitted source at `cd6d2359`; there is no alternate geometry owner,
runtime IK, body mirror, equipment refit or live catalog binding. Source assumes
30 fps and keys an 18-frame cycle with an exact endpoint.

[Editable controls](source-controls.json) preserve all nine prior actions,
37 editable meshes and the bind rig exactly. [Imported controls](import-controls.json)
preserve all nine prior clips; reauthoring the resulting source reproduces the
full rig and all ten imported clips exactly. Fresh exports differ only in tangent
fields on primitives 0, 2, 6; nothing pins old tangents. This is structural/source
preservation, not a claim that every old production screenshot was recaptured.

| Artifact | SHA-256 |
| --- | --- |
| Saved source blend | `7effdfe90a5532aee239ea5b09bc8a8c3c7222c5847d6f8106c2d65309a04290` |
| Saved source GLB | `48628dc0c83e80c1fb2534fd3ef158e54123b864d24a9c59b17e96a169f38b69` |
| Studied right blend | `a89c4e85488166973bc770e2c5015e71a9c1a942d890ddd1c2810109ab82a239` |
| Studied right GLB | `b3ba61c8dfb5ee3cfe88c2e4b698605fb5b92eea968b3a5484e84fd03ab36561` |
| Studied author recipe | `f68dedc28daa8c40bd503363b3d4fadc0f204460d354fb300b8cbac95a2497bc` |

## Grounding and kit limits

[Quarter-frame source telemetry](ground.json) finds minimum sole Z **-1.651 mm**
and minimum foot-center X separation **194.3 mm**. Prescribed root travel and
local pelvis motion are separate: the pelvis-head proxy moves rightward at
0.258–1.592 m/s around constant root speed 0.925 m/s. Its maximum X projection
outside nominal single-foot support is 232.2 mm. Pelvis head is **not true COM**;
this probe is diagnostic, not support or natural-motion acceptance.

During the nominal flat-support windows, source rigid-sole center X ranges are
below 0.152 mm, Y below 0.173 mm and Z below 0.693 mm. Those results exclude authored
roll intervals and do not prove runtime planted contact or lack of visible
skating. Dense source interpolation still has the reported small penetration.

[The original equipment probe](contact-smoke.json) samples nine poses and only
its explicitly listed sword/shield versus body/kit pairs. It reports no surface
overlap; it does **not** cover every kit pair, containment or continuous motion.
The fresh review prompted an additional scabbard/body probe:

- [Right](scabbard-contact-smoke.json): scabbard/mail surface intersection at
  phase 0/1, 46 triangle pairs, lower hem region Z 0.614–0.669 m.
- [Ready control](scabbard-contact-ready.json): no sampled overlap.
- [Preserved left control](scabbard-contact-guarded-left-walk.json): 56 pairs
  at phase 0.25 in a similar lower hem region.

This is a newly exposed whole-kit limitation, not a unique right-action
regression and not automatically a visible defect classified by triangle count.
No gear or left action was altered. The travel oblique exposes the shield side
well but occludes the scabbard hip; it cannot settle that finding's severity.
The [additional hip contexts](hip/) expose the actual scabbard side at yaw 120°,
zoom 220, with the whole body retained. Phase 0 was inspected before capturing
phases 0.25, 0.5 and 0.75. All four immediate repeats passed (10 combined checks,
no page errors). The [fresh hip review](fresh-hip-review.txt) actually viewed all
four images and found no strong visible blocker, while retaining projected
scabbard/leg overlap at phase 0 and uncertain hidden attachment. Fresh critic and author
agree that these views do not show a conspicuous cut-through or floating part.
The measured surface intersection remains open; visual ambiguity does not erase
it, and the motion was not distorted to hide it.

## Production frames and visual judgment

All captures use the production candidate page, shared pose/skin/material path,
fixed 1280×800 viewport, bundled Chromium/SwiftShader and the shared zero-tolerance
`snapCheck`. Review PNGs crop `(128,96,1024,640)`; scratch baselines are not
promoted production gates.

The [smoke](smoke/) contains ten consecutive phases each from actual front/rear,
for ready and the candidate: 40 frames, 81 checks, immediate repeats exact and
no page errors. Direct camera yaw is 180°/0°, pitch 1.4, zoom 180, target `[0,0,.9]`.
The [fresh smoke review](fresh-smoke-review.txt) viewed both whole contexts,
all eight strips and five additional originals (15 actual image blocks verified).
It supported a moving-world test, not acceptance.

The [prescribed film](travel/) contains 24 frames per front/rear/shield-side oblique
at 20 Hz, two cycles: 72 frames, 223 checks, all immediate repeats exact and no page
errors. Fixed yaw 180°/0°/240°, pitch 1.4, zoom 150, target `[speed*duration,0,.9]`.
The existing `travelInstances` helper uses offset `-pi/2`; signed rightward travel,
unchanged facing, exact absolute-time out-of-order seeks and production clip
sampling are checked. GIFs derive from the gated PNGs at 5 cs/frame; the animated
world reset at the GIF boundary is a review loop, not a simulated teleport.

Author reviewed every frame via all 18 chronological strips and whole contexts.
The [fresh travel critic](fresh-travel-review.txt) independently viewed all 18
strips, three whole contexts and two originals (23 actual image blocks verified).
Both provisionally retain the study: readable protection and opening/gathering,
but narrow/pinched recovery and coupled upper-body stiffness remain. The critic
does not establish firm planting or skating from ground detail, and correctly
labels its review as still-sequence inspection rather than actual GIF playback.

Preview showed the whole front pose and opposing fixed-root GIFs in one window
from **19:23:03 to 19:28:12 UTC on 2026-09-07**, with no user response. The window
was closed after five minutes. Continued study rests on direct and independent
review, **not inferred user approval**.

## Reproduction and closeout

Study worktree: `/Users/david/dev/game-heavy-right-study`. The durable author
recipe is `packages/soldier-assets/bake/blender-heavy-motion.py`. Original fitted
source stays unchanged; studied binary exports are ignored scratch outputs.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python packages/soldier-assets/bake/blender-heavy-motion.py -- --source packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend --output throwaway/heavy-right/candidate
```

Local measurement reproduction runs `cargo run --quiet --manifest-path Cargo.toml`
then `node summarize.mjs` inside `throwaway/right-measure`. Local capture uses
`node throwaway/bake-right.mjs`, Vite 5275, then
`VERIFY_GPU=1 VERIFY_URL=http://localhost:5275 node throwaway/capture-right-smoke.mjs`
and the corresponding `capture-right-travel.mjs`. These one-off probes remain
scratch; their complete JSON and captured evidence are archived here, not a
parallel committed renderer or clock.

The hip reproduction is `VERIFY_GPU=1 VERIFY_URL=http://localhost:5275 node
throwaway/capture-right-hip.mjs` for the first pose; setting
`PHASES=0.25,0.5,0.75` captures the remaining three after first-view inspection.

Pass review is complete. Shape: the new authored curves remain in the existing
heavy-motion owner, with shared action lifecycle and leg/orientation construction;
no parallel runtime or geometry owner was introduced. Diff: the
[independent review](code-review.txt) found no actionable defect and correctly
made no Blender/visual verification claim. Author source/import controls, Python
syntax, capture-script syntax, leaf links and diff whitespace checks pass.
Documentation: the leaf owns calibration and limitations; root owns its global
handoff/link update. No source edits followed the reviewed captures.

Root independently inspected all 72 travel panels and all four hip contexts,
read both fresh reviews and retained this as a manual provisional study. There
is no runtime selection, production baseline update or final art acceptance.
Existing production test behavior and baselines are unchanged; the additional
checks are isolated study diagnostics. The next bounded pass is selective
canonical integration with all old clips, geometry and existing image gates
preserved, not another art or kit adjustment.
