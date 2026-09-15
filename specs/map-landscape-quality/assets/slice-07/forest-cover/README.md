# Forest boundary material coverage

Battle material inputs now classify grass, rock, forest and scree before
interpolation. Blending categorical IDs made a grass0/forest4 edge pass through
rock2. Independent coverage weights cannot invent an absent material, including
at the CPU-built terrain seam. The battle adapter owns this decoding; shared
terrain and physical source data remain unchanged.

Fresh review accepts the removed gray-purple outline with high confidence.
Forest floor remains distinct from meadow. Fine ground striping and broad smooth
coverage remain separate visual limitations. The frozen seed8 frame changes
53,322 pixels, including41,161 above the HUD. The world and boundary crop repeat
with zero changed pixels. The full-frame repeat retains151 changed HUD pixels
(maximum summed RGB17); no snapshot tolerance or canonical pin was changed.

The new geometry/seam regression checks that grass/forest boundary vertices
contain zero rock/scree and interpolate forest to0.5. It failed before the
coverage attribute existed and passes through the actual geometry builder and
join. Full521 web tests and typecheck pass before the shoreline integration;
the merged shoreline/coverage/scenery focused10 tests and typecheck pass too.
Independent code review found no actionable defects. Browser capture reports
preserve physical source hash, camera and tick, with no page errors.

No physical terrain, tree positions, materials palette or atmosphere changed.
The GPU replaces one float tint attribute with three coverage floats, adding
8 bytes per battle terrain vertex; it adds no source buffer or runtime setting.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleTerrainCover: grass and forest interpolate through terrain joins without inventing rock or scree | No independent coverage existed; categorical0→4 crossed rock2. | Joined midpoint is rock0/forest0.5/scree0. | Classify before interpolation; regression introduced for the corrected material contract. **moved** |
