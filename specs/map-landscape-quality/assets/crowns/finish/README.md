# Crown silhouette candidate

The target is a connected, irregular canopy with readable main lobes and leaf edges that belong to its volume. The supplied landscape reference guides character; no exact coastline, camera or palette match is asserted.

The retained surface uses fewer main lobes for broad canopies. Aspen keeps its fuller crown distribution because thinning its narrow silhouette failed the existing family coverage gate. Close leaves sit slightly inside the volume with less lateral displacement, reducing detached-looking outline scraps. Species dimensions, instance scales, forest density, lighting, terrain, thresholds and draw buckets are unchanged. Every family retains 567 crown triangles and 2,647 with leaf detail.

The first six-lobe aspen trial failed the unchanged foliage floor (0.0263 versus 0.03). That trial is rejected; its images are not the final aspen baseline. Broadleaf zoom/return coverage passed at both pitches. The shape and detail still share one crown geometry and model registry.

## Review boundary

Independent code review found no actionable regressions. The shape pass added no owner, runtime state, dependency or new configuration surface. The existing screenshot scenes own the visual regression coverage; no implementation-mirroring unit test was added for geometric tuning. TypeScript and all 454 existing tests pass.

Fresh native/crop comparison and the separate [merged regional review](integration/README.md) accept simple matching character. Slice 06 is complete for tree form; planting and environment remain separate contracts.

## Verification evidence

The corrected aspen measures 0.0322 foliage ratio against the unchanged 0.03 floor. All family content checks pass. Both pitch sequences return from close leaf detail to the coarse crown with stable coverage (campaign normalized range 8.667–10.338; battle 6.153–6.897).

[Strict repeat results](strict-repeat.json) record 14 distinct tree PNGs over 18 capture calls, all with zero differing decoded RGBA pixels. The existing scenes ran on bundled headless Chromium/SwiftShader through `snapCheck` with `threshold: 0` and `maxDiffRatio: 0`; no tolerance or capture framing changed. Both zoom/return GIFs remain under the existing model snapshot folder. The shared prop scene also passed its existing rock/mountain/cart content checks without refreshing those non-tree baselines.

The [change ledger](change-ledger.md) names every moved image and its decoded-pixel count. [Comparison telemetry](comparison.json) compares the same camera/frame against the previous crown. Full-frame distance is 0.13659 at campaign pitch and 0.11285 at battle pitch; edge energy falls to 0.561 and 0.619 of the prior image, respectively. This localizes the intended reduction in busy outline/leaf detail, not missing crown coverage. The candidate is less wrong in the implementer's comparison: main lobes remain connected and readable, while the leaf surfaces no longer dominate their shape. Enlarged crops can still expose isolated edge flecks, so that remaining visual judgment is explicitly left for the unprimed review.

[Zoom sequence](zoom-sequence.png): campaign above battle, zoom 12 → 26 → 45 left to right. Before/candidate close crops accompany the native snapshots in `web/shots/models/shared/props/`. The supplied [reference](../../landscape-reference.png) remains the character target.

Size: production code 8 lines added, 7 deleted (net +1); comments and test/harness code unchanged. The capture driver and comparison tooling remain scratch files. There is no new structural maintenance surface.

Fresh unprimed comparison accepts the candidate tree-form contract for simple matching character: clearer connected lobes, solid coverage and fewer torn-looking fringe fragments at both pitches. Native families remain distinct, and visible trunks meet their crowns. Minor edge fragments and scratchy conifer needle detail remain visible; they do not defeat the native tree silhouette. Regional density, terrain and lighting were outside this verdict. Merged CPU verification passes all 464 tests and TypeScript; both campaign regional captures are updated and repeat exactly.
