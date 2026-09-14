# Water boundary investigation

## Source semantics checkpoint

The original full-resolution mask discarded the sea/lake/river classes after computing territory-capable land. That prevented a river from being both valid campaign land for existing road/territory rules and visibly wet for water/vegetation placement. The adapter now retains the same palette index in the same byte. `renderLandAt` keeps its old semantics; `renderWaterAt` includes seas, lakes and rivers. No save, map data, battle physics or geographic coordinates change.

The compact [body index](../../../../packages/game-renderer/src/water/waterBodies.ts) labels connected source water runs. Diagonal river pixels connect; a dry pixel separating basins still separates them. Eight-connectivity reduces the real raster's 3,449 four-connected fragments to 24 bodies without changing any wet pixel. IDs come from the whole immutable source, never a terrain tile. A separate query closure retains only the result arrays, not union scratch or source input.

Campaign body samples expose wet coverage, source kind, identity and water level independently. The palette has no inland water elevations, so its existing zero water datum is retained rather than inventing bathymetry. Signed shore distance remains owned by `campaignCoast`/`distanceField`; depth is a later visual proxy, not another interpretation of wet coverage.

The battle source already supplies lake identity and level from Rust hydrology. That remains authoritative. Its filtered field-water weight and its lake shoreline geometry still need reconciliation with the shared coverage semantics; this source checkpoint does not relabel battle physics.

## Allocation

The real source is 2,357×1,943 = 4,579,651 bytes. Retaining classes replaces the binary mask, so snapshot/worker-copy size is unchanged. Its 1,313,157 wet pixels form 15,770 row runs. The body index retains 197,016 bytes (row offsets plus packed start/end/body triples); building needs another 63,080 bytes of union parents, for a 260,096-byte typed-array peak. Two live source owners retain 394,032 bytes. This is CPU source/cache accounting, not GPU memory. It avoids an 18,318,604-byte full body-ID raster per copy.

The cached index is lazy and keyed by the immutable source. `renderWaterAt` needs only the class byte and does not build it. Source disposal is not kept alive by the cache.

## Geometry boundary still open

A 16 km regular overview mesh cannot preserve a 2 km island/channel merely by changing its interpolated water weight. A fragment-only wet override can put water on raised terrain; a separate level plane also requires bank faces, matching picking, and atomic tile suppression. Those are one surface-ownership problem, not an excuse for an untracked second water engine.

The next bounded comparison must show a narrow island, diagonal channel, river mouth and steep coast across fine/coarse geometry before choosing the geometry integration. Water color, foam, waves and ground material appearance remain outside this slice. No source-only test is evidence that those geometry cases are fixed.

## Verification boundary

This first checkpoint changes source queries, not rendered water geometry. Existing land-mask/city bake probes and worker mesh equivalence tests remain green. New tests cover river-versus-territory semantics, diagonal river/mouth connectivity, isolated basins, holes, stable clone queries, signed wet shores through the existing coast owner, all 512 three-by-three wet topologies against an independent cell flood fill, and compact allocation for a broad sea. No browser appearance acceptance is claimed here.

Independent code review found no actionable defect. Existing tests only rename the serialized mask buffer or supply the additional predicate; their assertions retain the same land/mesh behavior. The new tests introduce the water semantics and allocation checks. No screenshot baselines are changed in this checkpoint.
