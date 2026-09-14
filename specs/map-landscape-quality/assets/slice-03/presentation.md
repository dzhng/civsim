# Joined terrain and campaign anchors

Checkpoint accepted for spatial continuity and anchor coherence; real-world traversal, total memory enforcement and hardware timing remain open.

Fine tiles replace covered coarse triangles for rendering and queries. Only the outside boundary of the detailed region blends to the coarse indexed surface, including its unnormalized vertex normals and material signals. The material normalizes after interpolation. Internal tile boundaries preserve detail. A two-coarse-cell transition removes the narrow shading cutoff observed in the first candidate.

Coast distances use a fixed world lattice rather than the current geometry spacing. Shared points in the controlled fixture previously disagreed at 63 shore samples, 32 water samples and 15 beach-color samples; all three counts are now zero. The [resolution control](coast-resolution-control.json) and [real-source control](coast-real-control.json) distinguish this correction from unrelated appearance: the latter finds zero differences in fine-resolution Alpine/Italian vertex, index, tint, color and shore arrays.

## Verification

All 454 tests, TypeScript and lint on changed code pass. Full-web lint remains red on the unchanged `unitSnap` binding in `battleOrders.ts`; the binding is also present at the checkpoint parent. Seventeen captures repeat with zero decoded RGBA differences using the corrected [exact checker](exact-snapshots.md). The browser checks cover coarse, single tile, concave union, eviction, return, static hold, camera queries and visible body clicks at DPR1/DPR2. Build counts are 0→1→3→4→5; three resident tiles plateau at 1,055,412 payload bytes and 1,090,272 geometry bytes. Idle frames do not rebuild or change revision. These small-fixture figures are not the whole-map memory or hardware proof.

The army fixture rises from 11.6227736473 to 19.6227741241 km and returns on eviction. Its label moves from CSS y=375.477 to 339.018 with its body, standard, road and selection. Actual clicks select the raised and restored model at both DPRs.

Fresh unprimed review found no concrete join or anchor defects in the full frames and crops. Canonical shoreline removes the stepped shoulders visible in the ratio4 candidate. Army, flag, ring, label and road rise and return together. Static images establish attachment, not animation smoothness. Current evidence is in [canonical joins](joins/canonical/) and [anchors](anchors/); intermediate captures remain comparison evidence, not accepted appearance.

Independent code reviews led to divisibility checks for fine/coarse spacing, fragment-stage normal normalization, road bounding-sphere refresh, and accurate request-button labels. The final cached-ground-bounds finding does not apply because terrain disables frustum culling in both camera paths; see the checker evidence for the source inspection. No finding remains unresolved within this checkpoint.

## Change ledger

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaign-composition-flat | Previous committed image | 1 RGBA pixel changed | Ground normal normalization follows interpolation. **moved** |
| campaign-composition-dpr2 | Previous committed image | 5 RGBA pixels changed | Same normal correction at DPR2. **moved** |
| landscape-alps | Previous committed image | 7 RGBA pixels changed | Same normal correction; real-source fine geometry is unchanged. **moved** |
| landscape-italy | Previous committed image | 6 RGBA pixels changed | Same normal correction; real-source fine geometry is unchanged. **moved** |
| landscape-surface | Previous committed image | 1 RGBA pixel changed | Same normal correction. **moved** |
| terrainTiles failed-build diagnostic | Error object disappears as `{}` in JSON | `worker failed` survives serialized diagnostics | Report the scheduler error message to browser consumers. **moved** |

Five new surface tests pin exclusive coverage, boundary interpolation, concave joins, shading/water continuity and invalid grid spacing. The coast regression pins resolution-independent geography signals. Eight new snapshots exercise five tile states and three anchor states; existing snapshot tolerances were not weakened. No unit stats, physical simulation or save formats changed.
