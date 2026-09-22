# TypeGPU tree variants and projected detail

Battle and campaign share tree geometry, placement-stable variant selection and
projected-size detail policy. Backend buffers remain independently owned. A tree
keeps its closed canopy at every distance; nearby leaf cards add the silhouette
breakup. The same presence and cutout reach visible and shadow passes.

## Comparison and correction

Control uses the immutable bitmap-rock build 9b9481de. Candidate adds stable
variants and projected detail, at the same frozen clock, camera and 1280×800 DPR1.
Water changes are outside these dry forest views. Camera telemetry records the
actual near 141.96 m, far 1532.73 m and close 10 m eye-to-target distances.

The first candidate reused campaign thresholds and was rejected by root and
unprimed review: many nearby trees became smooth cones or blobs. See the rejected
near image. The shared algorithm now takes explicit profiles: campaign stays
unchanged; battle keeps leaf edges on smaller crowns. The final fresh reviewer
judges quality effectively equal to the original, with no new missing geometry,
ground-contact defect or isolated silhouette failure. Root agrees. This accepts
consumer adoption without claiming a better forest composition.

| View | Changed pixels | RGB mean absolute difference |
| --- | ---: | ---: |
| Near forest | 399,038 | 5.40381 |
| Far forest | 72,295 | 1.25184 |
| Close forest | 271,427 | 2.46587 |

All three final views repeat exactly with no browser errors or GPU warnings.
A same-world near→far→near camera trip changes detailed-tree count 939→0→939 and
returns the initial image at zero differing pixels. Campaign Alps, Italy and close Alps also remain pixel-identical after the shared
policy extraction. Canonical migrated scene gates remain tracked separately.

## Remaining visual limits

The close forest floor is nearly featureless, tree spacing is regular and open,
and broad shadows dominate it. Dark jagged leaf markings are visible in both
versions. These are composition/understory and shading work, not evidence that
variant selection failed. Whole-frame and hardware acceptance remain open.

## Ownership and cost

One canopy bucket and one leaf-only bucket per tree species share variant shapes
within each draw; variants do not multiply draw calls. Static scenery geometry
rises from 1,238,628 to 2,472,180 bytes. Tree instance capacity stores two 36-byte
pose/style/shape records instead of one 32-byte record. Maximum species/detail
buckets rise 6→11. One existing atlas serves every bucket and both draw audiences.
All geometry and capacity are admitted before camera preparation; camera changes
only compact/write existing instance buffers, and steady frames write nothing.

The neutral helper owns shape packing, leaf-index selection, variant hashing,
projection and detail selection. The retired instance packer has no remaining
caller and is removed. No new dependency, placement generator or atlas is added.

## Tests and review

The combined suite passes 1,076 tests, typecheck and build. Focused recording-device
checks exercise near/far/return, steady-frame zero writes, no camera allocations,
shared shadow/main leaf data and failed-growth disposal. CPU tests prove stable
variants after reorder/subset and projected sizes by depth/height. Independent
static review found no scenery defect; its traversal-completion finding is tracked
with the separate gate correction.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| sceneryShadowCoverage | Every uploaded tree carried leaves; same atlas in both draws | Canopy and selected leaves use the same atlas/presence; far/near/return preserves buffers, steady frames write nothing | Projected detail consumer, moved |
| treeCrowns reorder/subset | Variant builder existed without consumer reorder proof | Actual campaign instance shape stays stable across reorder/subset | Shared placement hash owner, moved |
| sceneryDetail hysteresis | Campaign-local thresholds lacked direct traversal assertion | Enter/leave bands retain state; fade follows projected size | Shared policy extraction, moved |
| sceneryDetail projection | Projection recipe lived in campaign consumer | Per-instance physical height and base depth determine pixels, behind-eye is zero | Shared geometric input, moved |
| sceneryDetail battle profile | Initial inherited campaign profile lost nearby silhouettes | 40px battle crowns retain leaves while campaign can retain canopy-only view | Visually justified mode-specific profile, moved |
| terrainSceneLifecycle committed stats | No scenery detail telemetry | Actual committed owner reports detail/draw/triangle counts and earth-distance metadata | Honest verification input, moved |

No simulation tests, terrain categories or placement densities change. Existing
resource-cleanup assertions remain in place; no snapshot tolerance is relaxed.

The migrated traversal initially used an async Playwright wait predicate, which
returned false instead of proving completion. That harness defect is corrected
with synchronous readiness followed by explicit GPU completion and same-revision
validation. The current browser run passes actual requested-camera admissions,
idle stability and repeated memory plateau; historical image baselines still
require review. This does not establish hardware performance.

Production source for this consumer pass adds 348 lines and deletes 147 (including
comments), net 201. This includes the shared policy helper and scene telemetry.
