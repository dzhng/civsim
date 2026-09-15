# Composed battle audit

Battle already uses the shared terrain response, scenery models, water and atmosphere. This pass changes verification only. Its target is connected relief, grass-to-stone transitions and vegetation seated into the landscape at battle scale; no geographic replica or new physical terrain is required.

Nine current frames repeat with zero differing pixels on headless Chrome hardware at 1280×800, DPR 1. All 33 scene checks pass, including real generated seed identities, deployment/passability certificates, authored cover and null gameplay slope descriptors. The source wasm is byte-identical to the parent checkout. These hardware images are explicitly separate from canonical software baselines; they are current audit evidence, not full landscape acceptance or a performance measurement.

The previous curated cameras placed the horizon almost outside the current field of view: pitch 0.305 against half-FOV about 0.323 left too little visible sky. Pitch 0.16 restores an actual vista and retains the existing terrain/sky pixel check. The source-feature forest view resolves crowns; the coastal overview exposes the water join. Camera changes are followed by the existing frozen-frame settle hook so asynchronous grass rebuilds finish before capture.

The public legacy battle route only supports A/B and generated maps. A is captured in the actual application; C uses the existing renderer-lab map C fixture with the full shared physical battle world, preserving its yellow-grass descriptor. Requesting `?map=C` in the application silently selects A; this pass does not change that routing contract. Isolated A/C preservation views remain available.

Initial startup failed because a temporary wasm symlink resolved outside Vite's permitted worktree. A local copy plus server restart fixed HTTP 403 and compilation failure; no gameplay source, wasm binary, timeout guard or shader was changed to resolve startup. The failed and successful bounded startup reports preserve this distinction.

## Remaining visual findings

Direct inspection finds a sparse western forest with conspicuous individual conifers and a sharply jagged dark-green ground boundary; the coastal vista joins water in regular stair steps. The highland vista provides continuous terrain but distant relief is heavily veiled, and authored rock props still sit on cloudy ground patches. These are observed gaps, not accepted fixes. Fresh independent image critique remains the final visual check.

The forest scatter owner has a fixed 240-instance cap per connected forest after sampling at 9.6 m spacing. Large source forests therefore become sparser as their area grows; this is a concrete follow-up candidate, not a proven sole cause of every vegetation defect. A shared density/budget policy could reduce duplicated campaign/battle decisions while each retains physical source membership and scale. The material and water factories already share their response; battle-specific semantic tint filtering and sea/vista geometry remain appropriate places to investigate the visible boundary defects.

Independent static review found one open delivery issue: the four newly named snapshots need reviewed canonical baselines before their scene edits ship. Existing software baselines were deliberately not replaced with hardware output. Full slice 13 acceptance, required gameplay/handoff checks and performance gates remain open.

## Independent critique and measured follow-up

Fresh image critique confirms the stepped water/vista seam and green lip, outlined angular forest boundary and sparse crowns, weak middle-distance transition from flat battlefield to hazy mountain walls, isolated cool rock props on beige patches, and yellow haze suppressing far terrain and enemy lines. Near formations remain readable. These findings keep whole-scene acceptance open: ecology/material transition belongs to 07, water topology to 08, distant lighting to 10, and battle composition/protected physical source to 13. Foothill presentation must be improved in vista/materials without moving playable terrain.

The actual seed 8 census resolves the forest-cap hypothesis. Its western connected forest covers 265,248 m² (16,578 source cells). Of 2,873 eligible visual candidates, zero fail the rendered slope gate; the 240 cap removes 2,633 (91.65%). The resulting geometric canopy footprint covers 2.348% of those exact forest cells. The other five components are uncapped and cover approximately 26–29%. Across the map, 3,451 eligible candidates produce 818 trees and 6.579% canopy coverage. One isolated source forest cell is below the existing feature-extraction minimum and has no feature instance.

Coverage rasterizes actual coarse opaque model triangles in XY with production variant, rotation and scale, clipped to source forest membership. It measures geometry, not alpha-tested leaves or perspective screen coverage. Reducing raster spacing from 0.5 m to 0.25 m changes total covered area by 2.1875 m² out of about 20,929 m². The census reconciles against the actual placement function and records the same source terrain hash as the browser. No density or cap change has been made.
