# Battle coverage and leaf shadows

The terrain must blend existing materials without introducing a third category between them. Tree shadows must use the same leaf silhouette as visible crowns. These are bounded correctness improvements, not acceptance of the whole landscape.

## Evidence

Control is commit `9e6d434f`; candidate replaces scalar render IDs with rock/forest/scree weights before CPU joins and GPU interpolation, and uses the visible leaf sampler/cutout in the shadow pass. Both use the same built TypeGPU production world through the renderer lab, frozen tick/time, 1280×800 DPR1 and zoom7.8. Exact URLs, camera and resource telemetry are in the JSON records. Immutable builds avoid dev-server hot reload during captures.

All six candidate frames repeat at zero pixel differences, with no page errors or GPU validation warnings. Full frontend suite: 1,066 tests; typecheck and production build pass. Independent static review found no actionable regressions. These software-GPU captures make no hardware-performance claim.

| View | Changed pixels | RGB mean absolute difference |
| --- | ---: | ---: |
| Generated forest edge | 84,942 | 0.74673 |
| Authored forest edge | 81,042 | 0.44770 |
| Authored rock A | 0 | 0 |
| Authored rock C | 0 | 0 |
| Leaf shadows | 427,405 | 5.85701 |
| Leaf shadows disabled | 4,982 | 0.02906 |

The generated boundary was chosen from seed8's actual source grid: its local neighbourhood contains grass and forest, with no rock. The previous grey outline was therefore invented by interpolation. The candidate removes it while both authored rock controls remain identical.

The shadows-disabled frame has a small terrain delta from the coverage change. Shadow attribution excludes those pixels: 422,450 shadowed pixels still change among the 1,019,018 pixels whose unshadowed values are identical. The enlarged shadow crop has **zero** unshadowed changes, so its canopy/ground-shadow differences isolate the leaf mask. See `shadow-isolation.json`.

## Visual verdict

Root and an unprimed reviewer inspected full frames and enlarged boundary/shadow crops. Candidate is less wrong: it removes the staircase grey outline and retains brighter, coherent canopy volumes. Tree positions, ground contact and shadow direction remain consistent. No new visible defect was identified.

Remaining issues are real: the forest floor is nearly featureless, transitions look airbrushed, shadows remain dense and geometric, and authored rock patches look like soft stains. The latter are unchanged controls, not proof of rocky relief. Continue material response and crown representation work; do not mark slices06 or13 complete.

## Ownership and cost

One neutral CPU coverage recipe serves both rendering adapters, including vista joins. Three's duplicate vista recipe and unused raw TypeGPU shader wrappers were removed. Simulation tint grids, height, normal, water and earth-distance behavior remain unchanged. Classified meshes store three floats rather than one: eight extra bytes per vertex. Campaign meshes without categorical coverage allocate none. Shadows borrow the existing leaf texture/sampler group and allocate no new GPU resource.

## Test behavior ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleTerrainCover: production CPU vista seam | No CPU seam coverage assertion; scalar grass0/forest4 could cross rock2 | Fractional forest coverage exists; rock and scree are zero throughout | Conversion happens before seam interpolation; new regression coverage, moved |
| battleTerrainCover: Three terrain joins | Three adapter converted scalar categories before shader blending | Receives already converted neutral weights; same no-phantom-rock assertion | One classification owner, moved |
| groundSurface: earth/scree semantics | Cleared mud/road scalar0, scree scalar6 | Mud/road [0,0,0], scree [0,0,1]; earth-distance assertions unchanged | Representation replacement, moved |
| surfaceTiles: coarse edge interpolation (packed and separate colors) | Scalar tint equals y/4 | Forest weight equals y/16, rock/scree zero; geometry/color assertions unchanged | Interpolate coverage instead of numeric IDs, moved |
| sceneryShadowCoverage: production shader and draw binding | No regression test; caster ignored leaf texture alpha | Compiled caster samples leaf atlas and cutout; actual visible/shadow draws bind same atlas; disposal leaves no resources | Shader and missing-binding mutation reds prove both halves, moved |
| terrainWorker: transferred campaign mesh | Optional tint absent | Optional coverage absent | Campaign payload contract follows new field; byte assertions unchanged, moved |

Terrain admission, rendered-surface, shoreline and tile-accounting fixtures only replace tint storage with coverage storage; their behavioral assertions are unchanged. Tile accounting still counts a shared backing buffer once. No simulation tests, unit stats or physics changed.

The canonical character scene also replaces retired Three readiness/stats hooks with the current completed-frame TypeGPU contract, checks the actual camera and visible layers, preserves authored scenery, and adds the isolated generated forest boundary. Its authored names are preserved. This corrects an obsolete harness; it does not weaken snapshot tolerance.

Canonical authored baselines previously came from the retired Three renderer
(commit247546af) and included rock props. They must retain those props when
migrated to the current TypeGPU visibility names. Their new-baseline differences
include backend migration and cannot be attributed to this bounded fix; the
isolated before/after controls above establish attribution.

All three final canonical character views pass and repeat exactly, with authored
props retained and no page errors; see `canonical-repeat.txt`. The initial run
without VERIFY_GPU was stopped and excluded. Earlier intermediate isolated
authored baselines were replaced, not accepted as a reduction in scene coverage.

Review cleanup removes duplicated vista construction and dead raw shader wrappers.
Production source totals (including comments): 115 lines added, 254 deleted,
net −139. The only new durable data surface is the three-channel render coverage;
no dependency, flag, gameplay schema or GPU texture is added by this pass.
