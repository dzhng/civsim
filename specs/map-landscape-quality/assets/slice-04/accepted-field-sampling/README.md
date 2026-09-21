# Accepted mountain field: bounded CPU sampling diagnostic

The 1km mesh reproduces the accepted analytic mountain field more closely in the sampled close Alps window. This establishes interpolation undersampling in the 2km mesh; it does **not** establish visible silhouette improvement, more natural drainage, or authorization for a runtime resolution increase.

Run: `bun throwaway/mountain-sampling-cpu.ts` from `/Users/david/dev/game-landscape-understory`. The [observed probe](observed-probe.ts.txt), [input shim](input-shim.ts.txt) and [results](results.json) are retained with this report. No renderer, browser, Vite, build, dependency install, commit, production edit, or test edit was involved.

## Exact comparison

Both calls use the same real PNG-decoded `TerrainField` from existing `throwaway/harness.ts`, center `(-450,990)`, radius 64km, extent `[-514,-386] × [926,1054]`. Only `buildCampaignLandscape` geometry cell changes, 2→1km. The source remains 589×486 at 8km. Source height, biome, and render-mask SHA256s are unchanged before/after; hashes and relevant producer file hashes are recorded in JSON.

City clearance, source grading, source blurs, and node roughening are already baked into this same `TerrainField.height`; none is reimplemented or removed. The direct target uses the public `campaignRelief(field,2)` with the production filter argument fixed at 2 for both meshes, and reconstructs each build's exact coast callback using `campaignLandscapeAllocation`, `campaignCoastCell`, and `buildCampaignCoast`.

The final surface is the actual returned shoreline-conformed mesh, sampled through `sampleRendered`. This matters: the initial regular grid diagonal is replaced by shoreline conformation's polygon fan, even in fully dry cells. Hand-interpolating the initial grid would measure the wrong surface. Every final vertex in both windows is dry and has saturated coast attenuation; its analytic height agrees within 0.00000370 presentation km, consistent with Float32 storage.

**Coast qualification:** the immutable coast source is identical, but raw scratch distance arrays are not literally identical between geometry resolutions. Different halo extents create differing far-distance sentinel values; sampled inland values differ by up to 7.996km. Their minimum is 347.827km (a bounded-grid sentinel, not a physical measured coastline distance). Both exceed the 16km attenuation range everywhere compared, including every contributing triangle vertex. Therefore the coast multiplier is exactly 1 and direct target height is exactly identical at every comparison point (`maxAnalyticDifference = 0`). The final shore-distance attribute is likewise saturated at +18km. This proves isolation for this interior window only; it does not support an unchanged-coast claim near shorelines.

Terrain's rock response does not displace vertices. The measured heights are presentation surface heights, with the game's exaggerated relief, not elevations in real-world kilometres. No shader appearance or GPU cost is inferred.

## Results

262,144 shared points form a quarter-km lattice offset from grid vertices and fixed diagonals. No points were excluded: every sampled triangle passed the dry/saturated-coast check. Errors below are absolute vertical differences in presentation world km; maxima are sampled maxima, not mathematical bounds.

| Metric | 2km mesh | 1km mesh |
|---|---:|---:|
| Mean absolute error | 0.100358 | 0.026739 |
| RMS error | 0.147172 | 0.040452 |
| Median error | 0.071264 | 0.018734 |
| p90 error | 0.213402 | 0.055358 |
| p95 error | 0.290412 | 0.077891 |
| p99 error | 0.530988 | 0.153086 |
| Maximum error | 1.784560 | 0.667004 |
| Upper height quartile p95 | 0.382352 | 0.103997 |
| Upper height quartile maximum | 1.445574 | 0.526186 |
| Triangles | 8,192 | 32,768 |
| Vertices | 4,225 | 16,641 |
| Packed vertices + indices bytes | 267,304 | 1,058,856 |
| All final mesh typed arrays bytes | 304,817 | 1,207,601 |
| Producer generation-byte accounting | 643,410 | 2,334,578 |

The upper height quartile uses the same analytic threshold (46.254383) and same 65,536 points for both meshes; it is a high-terrain subset, not an identified ridge set. p95 error falls 73.2%, while the sampled maximum falls 62.6%. Four times the triangles and about 3.96 times final mesh bytes buy that reduction in this dry window. Generation accounting includes producer scratch and overlapping allocations, excludes shared source/JS objects/GPU resources, and is distinct from the final resident mesh bytes. Build durations in JSON are single un-warmed diagnostic timings, not a benchmark.

At the coarser mesh's worst sample `(-500.9075,1023.1525)`, error decreases from 1.784560 to 0.197686; the 1km mesh's worst sample lies elsewhere, `(-501.4075,1023.6525)`. Neither establishes silhouette crest location error. The contour topology, walls, source envelope, and regional mass have been preserved, not evaluated for visual quality.

The existing PNG shim box-averages the source raster and is not a claim of bit-identical browser `drawImage` resampling. Both cases consume exactly the same shim-created field. This diagnostic supports proceeding to the separately scoped, camera-matched visual control if desired; it does not substitute for it or justify adopting a refiner.
