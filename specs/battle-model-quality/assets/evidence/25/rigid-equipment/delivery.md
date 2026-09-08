# Rigid artillery within the crew bundle

Slice25 requires artillery equipment, not only a human holding a rammer. The previous authored crew omitted the root-mounted equipment represented by the old `soldierMesh.ts` artillery branch. This pass adds original timber rails/crossmembers, braced throwing beam and open cradle, axles and wooden wheels to the same skinned bundle. It introduces no prop renderer, machine animation, simulation behavior or controller event.

## Placement and ownership

The legacy assembly is right/forward of the crew: chassis center near native `(0.58,0.26,0.5)`, lateral supports near x0.18/0.98, forward arm tip near y1.4/z1.06. Its long arm is predominantly forward, despite an earlier verbal description calling it upright. The new shape preserves that placement envelope rather than copying the old boxes. Equipment points span x[-0.02,1.18], y[-0.26,1.50], z[0,1.135]. The wheels meet the floor. This is a static role silhouette, not a historically exact working artillery reconstruction.

The existing Blender `root` bone was non-deforming and omitted by deform-only export. It is now exported for explicit one-weight machinery attachment. No source bone was added or moved; the imported rig includes one previously omitted ancestor and therefore changes joint indices. No importer fallback, synthetic root weighting or source compensation is used. Existing full-body role bindings remain applicable.

The authoring owner is `blender-ranged-foot.py`, which adds the equipment for newly built crews. For this frozen donor, `add_artillery_equipment` was applied to the saved approved crew and its combined export mesh, without rebuilding body pieces. The preserved local reproduction adapter is `/Users/david/dev/game-artillery-equipment/throwaway/artillery/append.py`; its input is the crew Blend from base64a6fec9, preserved beside it under `before/`. It calls the same authoring function and existing final exporter, not a second asset pipeline. The committed updated Blend is the durable editable donor.

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
