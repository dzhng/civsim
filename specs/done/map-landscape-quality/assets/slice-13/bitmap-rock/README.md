# Battle rock material adoption

Rock detail should describe a continuous stone surface, remain quiet at distance,
and preserve the landform's lighting. The campaign and battle adapters now share
the same raw height asset and response constants; each backend owns its GPU image.

## Controlled comparison

Control is 2391144e's immutable build; candidate adds the shared bitmap consumer.
The same TypeGPU production world is framed through the lab at frozen time/tick,
1280×800 DPR1. The generated seed 8 ridge is viewed at actual eye-to-target distances
499.081 m and 1532.732 m. Camera bounds clamp the requested targets; recorded actual
centres and camera3d parameters, not URL labels, define the comparisons. Both
candidates use those same actual cameras. Initial exploratory zoom 3/1.3 captures
both landed at the whole-map rig endpoint and were rejected as distance evidence.

| View | Changed pixels | RGB mean absolute difference |
| --- | ---: | ---: |
| Generated ridge, closer | 921,255 | 2.13403 |
| Generated ridge, distant | 305,443 | 0.40949 |
| Generated clay | 0 | 0 |
| Authored rock A | 0 | 0 |
| Authored rock C | 0 | 0 |

All five candidate captures repeat exactly with no page errors or GPU warnings.
The clay control demonstrates unchanged geometry and large-form lighting. Authored
A/C preserve tactical rock props and their painted footprints. Their sampled
physical slopes are below the new visual rock threshold, so unchanged images do
not prove steep authored-slope appearance; the compiled shader test covers the
null-descriptor path. Gameplay descriptors remain null, with no new terrain recipe.

## Verdict and limits

Root inspection and an unprimed comparison favor the candidate. Connected
fractures replace disconnected speckles, retain detail in shadow and show no
obvious stretching or seams. Distant texture remains restrained; static images
cannot establish absence of shimmer. The network is still fairly uniform across
slopes, and diagonal streaks are visible on part of the distant ridge.

Stone-to-grass integration remains incomplete: smooth saturated green patches
and scalloped category boundaries still look artificial. The ridge's overall
softness/darkness also remains. This accepts the bitmap adoption, not the whole
terrain-quality target. Composed worlds, motion and hardware budgets remain in slice 15.

## Resource and ownership contract

One 512×512 RGBA8 linear image with 10 mip levels costs 1,398,100 logical GPU bytes
per battle terrain scene. Ground and all vista replacements borrow it; decoding
occurs once, the bitmap closes after upload, and the image outlives pending layer
admission. The material performs three filtered texture samples per fragment.
There is no per-layer decoder, global cache, new dependency or terrain schema.
The moved PNG is byte-identical. Dry normals and water calculations are preserved.

The neutral material profile owns face frequency, fracture/fade bands, bench
mix and roughness coefficients. Three expresses these through TSL; TypeGPU through
its shader function. Both retain one geometry-derived lighting normal. Authored
category IDs denote prop footprints and therefore do not become generated-source
rock masks; geometric slope response uses the existing visual default profile.

## Verification ledger

Full frontend suite: 1,072 tests; production build and typecheck pass. The focused
suite passed 27 tests. Independent static review found no actionable defect in
resource lifetime, bindings, snapshots or shader boundaries. No Rust/simulation
or unit-stat changes occurred.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| terrainRockDetail: authored sampler/draw | No bitmap terrain resource/binding proof | Real TypeGPU shader and draw bind borrowed linear mip texture with repeat filtering; null gameplay bands still emit geometric slope response | New consumer contract, moved |
| terrainRockDetail: failed admission | No scene bitmap upload | Failed admission frees mip image and closes decoded data | New failure lifetime, moved |
| terrainSceneLifecycle: shared image | Layers had no shared rock image | One decode feeds six ground/vista creations across two generations; failed replacement retains it; repeated disposal releases once | Scene ownership, moved |
| terrainSceneLifecycle: initial failure | No shared image to release | Failed first layer releases the scene image | Constructor failure, moved |
| terrainSceneLifecycle: pending disposal | Only layer resources awaited | Shared image remains live until pending borrowed layer resolves and releases | Borrowed resource lifetime, moved |
| terrainSceneLifecycle: snapshot order | Existing synchronous input snapshot lacked async-decode regression | Caller mutation during deferred decode cannot alter admitted grid | Preserve snapshot before first await, moved |
| terrainSceneLifecycle: committed stats | No image metadata | Active generation reports one image's dimensions/mips/bytes; disposed reports null | Honest resource telemetry, moved |
| rockDetailFace: raw asset grade | Backend-local PNG; explicit inverted thresholds 0.28/0.56 | Same bytes from neutral owner; same thresholds derived from shared fracture band | Owner move without repinning measured grade, moved |

Terrain-admission fixtures now supply a borrowed texture; existing cleanup
assertions remain unchanged. No baseline tolerances were weakened.

Campaign Alps, Italy and close Alps production views all match the accepted
road-width checkpoint at zero pixels, with no page errors. The neutral asset move
and policy extraction therefore preserve these campaign frames; see
`campaign-regression.json`.

Production source (including comments) adds 146 lines and deletes 56, net 90; the PNG
moves unchanged. Added structural surface: one scene-owned bitmap resource and
its borrowed texture binding. Existing image upload and mip generation are reused.
