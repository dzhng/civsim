# Rigid artillery within the crew bundle

Slice25 requires artillery equipment, not only a human holding a rammer. The previous authored crew omitted the root-mounted equipment represented by the old `soldierMesh.ts` artillery branch. This pass adds original timber rails/crossmembers, braced throwing beam and open cradle, axles and wooden wheels to the same skinned bundle. It introduces no prop renderer, machine animation, simulation behavior or controller event.

## Placement and ownership

The legacy assembly is right/forward of the crew: chassis center near native `(0.58,0.26,0.5)`, lateral supports near x0.18/0.98, forward arm tip near y1.4/z1.06. Its long arm is predominantly forward, despite an earlier verbal description calling it upright. The new shape preserves that placement envelope rather than copying the old boxes. Equipment points span x[-0.02,1.18], y[-0.26,1.50], z[0,1.135]. The wheels meet the floor. This is a static role silhouette, not a historically exact working artillery reconstruction.

The existing Blender `root` bone was non-deforming and omitted by deform-only export. It is now exported for explicit one-weight machinery attachment. No source bone was added or moved; the imported rig includes one previously omitted ancestor and therefore changes joint indices. No importer fallback, synthetic root weighting or source compensation is used. Existing full-body role bindings remain applicable.

The authoring owner is `blender-ranged-foot.py`, which adds the equipment for newly built crews. For this frozen donor, `add_artillery_equipment` was applied to the saved approved crew and its combined export mesh, without rebuilding body pieces. The preserved local reproduction adapter is `/Users/david/dev/game-artillery-equipment/throwaway/artillery/append.py`; its input is the crew Blend from base `64a6fec9`, preserved beside it under `before/`. It calls the same authoring function and existing final exporter, not a second asset pipeline. The committed updated Blend is the durable editable donor.

## Controls and red-first evidence

- [new source invariant] `artillery-equipment.test.mjs`: the old crew fails because it has no exported equipment root. The completed source and all three runtime tiers pass rigidity and right/forward/ground envelope checks through14 clips×3 samples. These are sampled attachment checks, not collision-free anatomy certification.
- [new preservation invariant] `blender-ranged-foot.test.py`: all28 old editable parts (positions, topology, UVs, skin weights),28 bone transforms/hierarchy and14 action signatures remain exactly unchanged. The intentionally changed root deform/export flag is outside that equality.
- [export boundary] Optional `--before` in the GLB test proves exact old body/tool positions, UVs and named skin weights. Existing action identity/duration, key times and interpolation remain exact; including the root changes Blender's transform decomposition rounding by at most1.7881393432617188e-7. The independent1e-6 channel bound is not an art tolerance. Fresh normal/tangent exports are not byte-pinned; complete equality of those arrays is not claimed.
- [existing production controls] `mesh-lods.test.mjs` passes original→near→mid and original→mid→far: exact tier rig/actions, retained material/texture semantics, finite attributes and valid mapped tangent frames/normalized weights.

The initial16-sided wheels were reduced below the floor by26mm at far and rejected (`wheel-floor-red.txt`). The final source uses simple eight-sided wheels, retained exactly by the shared exporter's existing small-island policy. No LOD policy or grounding tolerance was loosened. Final original/near/mid/far counts are97420/7968/986/790; equipment576 exported vertices have identical bounds through all tiers.

Independent code review61187 ended0 with no actionable defect. It reproduced exported checks but could not run its Blender check because that sandbox process crashed at startup. The actual isolated background saved-scene check65887 ended0; do not attribute that reproduction to the reviewer.

## Source identity and runnable checks

Updated Blend SHA256 `fb6afe7a48051998fc9cfec3ce99e344f1452ec6f02ca1bb9428a77f445c227f`; original-resolution GLB `d802bbbcc0677cc72b827771023a4c5acbf70e2aef332f11b15505be83c45fe4`. Final tier hashes and exporter parameters are in `reduction.json`.

From the repository root, use the existing Blender executable with `--background --factory-startup --python-exit-code 1 --python packages/soldier-assets/bake/blender-ranged-foot.test.py -- <before.blend> <after.blend>` for saved-source preservation. Run `node packages/soldier-assets/bake/artillery-equipment.test.mjs --before <before.glb> <source.glb> <near.glb> <mid.glb> <far.glb>` for the exported controls. Source files live under `packages/soldier-assets/assets/source/foot-roster/artillery-crew/`; runtime GLBs use its `lods/` directory. The existing `blender-mesh-lods.py --source <crew.blend> --body artillery-crew-Deform --output <lods>` owns regeneration.

Production publication belongs to the root roster baker. No placeholder or repeated-source inspection bundle is being promoted by this source commit.

## Production visual closeout

The existing `blender-ranged-foot` scene captured six unchanged crew poses from four bearings through the production workbench. The original-resolution equipment capture14230 and practical-near capture63562 each finished1 solely for their intentional changed sheet; each passed all24 immediate frozen-pose repeats and had no page errors. Their same-camera differences against the old equipment-free sheet were1,085,873 and1,486,486 pixels. These count changed pixels, not quality. Old, original-resolution and practical-near sheets are preserved here.

Fresh neutral review27778 judged the original-resolution equipment donor less wrong than practical near, and both satisfy the missing-equipment target better than the equipment-free reference. It retained coarse tunic patches, projected wheel/leg overlap and unclear operating contact. It also found a real framing defect: the oblique cradle tip was cut. Main inspection confirmed that defect rather than accepting the numerically green pose checks.

Only the crew's camera landmark changed. A first native-space target attempt4479 moved the wrong way because `_candidate-sheet` consumes authoring-space landmarks and negates XY; that rejected report remains `centered-sheet.json`. The corrected authoring target keeps the same source, zoom, poses, viewport and renderer. Final capture9304 ended1 against the old baseline as expected. Its camera change makes full-frame pixel distance unsuitable for isolating geometry quality; the earlier same-camera controls still supply that comparison.

Main inspected all24 final panels. Fresh unprimed framing review97125 independently inspected every panel and the whole-pose oblique crop: all heads, feet, wheels and forward tips are contained; the assembly is connected and recognizable, with no definite detached component or demonstrated body-machine intersection. **Projected wheel/leg overlap remains a high-confidence readability limitation**; neither the images nor the source rigidity checks certify collision-free operation or correct hidden foot contact. Coarse surfaces and plain angular wheels remain under the user's completion-first quality disposition. There is no machinery animation claim.

Parent reviewed and approved only the crew sheet replacement. Final normal repeat86563 ended0: the full24-panel sheet matched at0 differing pixels, every immediate per-pose repeat passed, and no page errors occurred. Other ranged sheets and all snapshot tolerances are unchanged. GPU/browser ownership was explicitly released afterward.

One owned Preview set opened12:21:53 UTC with the then-current sheet/crop. The sheet-window close was requested12:23:53 when the framing defect was confirmed. Final cleanup found that the grouped crop had remained/surfaced, so owned Preview was quit12:33:23 and process exit confirmed; no other Preview documents were open. This exceeded the intended window deadline and is recorded as cleanup failure, not a successful five-minute checkpoint. The defective view was withdrawn, not accepted through silence, and no user approval is inferred.

Reproduce the final manual inspection donor with `node packages/soldier-assets/bake/foot-variant.mjs --name artillery-crew --source packages/soldier-assets/assets/source/foot-roster/artillery-crew/lods/near.glb`, then from `web` run `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5489 SNAP=ranged-foot/artillery-crew node scene.mjs blender-ranged-foot`. This existing manual-only single-mesh inspection path does not claim to exercise distance admission; the independent source-tier tests and root production roster own the three actual runtime tiers. Root regenerates the manual candidate outputs separately from this source/evidence donor.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| Top-level crew attachment checks, `artillery-equipment.test.mjs` | New test failed on the old crew: explicit machinery root absent. | Source and three tiers contain the same576 rigid equipment vertices;14 clips×3 samples leave them fixed in the recorded right/forward/ground envelope. | Implements the omitted slice25 component without a new renderer. **carried-in** |
| Ground envelope, `artillery-equipment.test.mjs` | First new16-sided far wheel reached−0.02598m, beyond the unchanged0.02m test bound. | Source/simple-wheel shape remains exactly z0 at every tier. | Eight-sided source wheels survive the existing simple-island exporter unchanged; no threshold relaxed. **your-regression** |
| Old-channel preservation, `artillery-equipment.test.mjs --before` | Strict exported track equality rejected root-inclusion decomposition rounding; body-normal equality also exposed ordinary re-export differences. | Exact old body/tool positions, UVs, named weights, clip identities, times and interpolation; transform values bounded by1e-6, observed maximum1.788e-7. No exact exported normal/tangent claim. | Rig hierarchy now explicitly includes the pre-existing root; saved-source equality independently pins actual authored values. **moved** |
| `snapshot` comparison, `blender-ranged-foot.test.py` | Existing saved crew was the preservation control; no dedicated append test existed. |28 parts,28 bone transforms/hierarchy and14 authored action signatures exact. | New equipment must not revise approved body or motion; intentional root deform flag is excluded explicitly. **moved** |
| `shared/soldiers/ranged-foot/artillery-crew/equipment-release`, existing scene | Sheet showed only crew/rammer; added equipment initially clipped at oblique edge. | One complete24-panel practical-near equipment sheet; normal repeat0px. | New required geometry plus crew-only authoring-space centering; other rows/thresholds unchanged. **moved** |

No unit statistics, simulation actions, outcomes or renderer policy changed. The incidental duplicate `pikeFamilyPresentation` import in the merged medium scene prevented the global scene registry from loading; its redundant second import was removed, with no visual or selection semantics change. The final follow-up does not overwrite root's subsequent unused-parameter cleanup in the authoring helper.
