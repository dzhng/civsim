# 08 — Coasts, channels and river connections

Status: in progress. Dependencies: [01](01-surface-contract.md), [03](03-bounded-terrain.md), [04](04-mountain-form.md).

## Contract and owner

The source adapter and surface water domain own wet coverage, body identity and signed shore distance. Territory, water and land queries consume that same boundary with their explicitly different semantics.

Slice variable: **Geographic water placement and terrain-water geometry.**

## Work

Extend the canonical world-stable shore-distance owner delivered by 01 with connected-body data, consistent water levels and bank geometry; do not introduce another shore transform. Preserve narrow islands, channels, cliff coasts and existing river mouths from the source raster/map. Join terrain banks and water surfaces without a floating edge or an all-coast sand skirt. Give inland bodies a consistent water level and connect known river mouths; do not create major river networks from procedural detail. Any shoreline refinement preserves source geography and cannot strand cities/roads. Keep depth proxy data distinct from wet coverage.

## Runnable checkpoint

Planned landscape-shores scene: small island, channel, river mouth, beach, and coastal mountain in flat diagnostic material; include both tile and water-body boundaries.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

World-coordinate coast/land tests, body continuity, shore-sign agreement and boundary sampling. Compare territory clipping and road land queries against the same boundary. Check channels/islands survive overview and close views, and that coastal geometry remains seated after LOD swaps.

Crop/mask: Shore outline, inlet/island and river-mouth crops. Water color, foam, waves, final rock texture and lighting are out of scope and held flat.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Bank tessellation, connected-body construction and bounded depth-proxy generation are delegated. Reuse the distance-field algorithm and world-stability contract from 01. Major geography, city positions and existing crossings are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A user-supplied geographic correction changes source data. Better-looking water alone is not grounds for moving the shoreline.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.


## Source checkpoint and next boundary

The [source investigation](../assets/slice-08/README.md) separates wet coverage from territory-capable land without enlarging the serialized mask. A compact source-wide run index retains connected river/body identity. Existing canonical shore distance remains authoritative; body level and future depth proxies are separate signals.

The first checkpoint does not change water geometry. Before the next geometry pass, demonstrate the narrow-channel/island failure at coarse resolution and reconcile bank geometry, water level, picking and tile suppression as one surface contract. A texture-only water mask on sloping terrain is not sufficient. Battle lake levels remain supplied by physical hydrology rather than re-inferred from filtered water weights.

### Bounded shoreline geometry pass

Keep one `LandscapeMesh` and one presented-surface query. A mesh may supply a cell-to-triangle prefix table when shoreline cells need more than two triangles; ordinary regular meshes keep their implicit two-triangle lookup and allocate no table. Every triangle remains inside its owning XY cell, so the existing bounded ray traversal still applies. Coarse suppression removes the complete triangle range for each covered cell. Tile admission and eviction continue to swap geometry, queries and anchors in one transaction.

The fixture first partitions shoreline cells along the existing source raster boundary. Water faces stay at the source body's level; dry bank vertices meet that level. Source XY coverage is invariant across LOD. Morphing may ease dry relief toward the coarse owner but must not move source boundaries, lift wet faces, or blend wet coverage across a bank. A channel, a small island and a diagonal river crossing the tile boundary must retain both visible and queryable coverage before real-source adoption.

Allocation includes the optional triangle table, conforming geometry, worker transfer and retained query arrays. Measure fixture and real boundary-tile/overview sizes before global integration; reduce resident detail if necessary within the existing 128 MiB feature ceiling. No separate water overlay, global fine shoreline mesh or additional shore-distance transform is authorized by this contract.

### Geometry checkpoint — 2026-09-15 (not visual acceptance)

`landscape-shores` is now runnable with before/coarse/detail/real cases. The
source-center marching polygons preserve pixel-center wet/dry identity, join
ambiguous diagonals through water, and clip each polygon into the existing
surface cell. One mesh drives water placement and both vertical/oblique queries.
Coarse masking suppresses every triangle in a covered cell. No production
campaign builder has adopted this prototype.

Evidence: four SwiftShader captures at 1280×800 DPR1, frozen time, repeat with
**zero differing pixels** and no page errors. Before→coarse changes 327,618 pixels
(31.99%); coarse→detail changes 29,465 (2.88%). The outline improvement is real:
channel, diagonal connection, single-pixel island and isolated body are visible.
The unprimed visual critique confirms those connections, but rejects the real
bank's repeated angular teeth and abrupt triangular slope transitions. Fixture
banks also have too little relief to establish bank quality. These diagnostic
snapshots pin the current checkpoint; they do not certify slice acceptance.

Measured allocations:

| Case | Typed mesh | CPU + GPU steady | Peak | Triangles |
|---|---:|---:|---:|---:|
| Fixture coarse | 35,087 B | 78,039 B | 78,039 B | 700 |
| Fixture with detail tile | coarse above | 135,662 B | 256,440 B | coarse above |
| Real coastal 128 km window | 35,984 B | 79,360 B | 79,360 B | 678 |
| Real-source 5,120 km overview, 32 km cells | 32,140,442 B | 71,140,682 B (declared resources) | admission rejected | 616,212 |

The overview measurement uses the actual full source raster and flat dry relief
(to isolate topology allocation); it takes approximately 2.95 seconds of CPU work
on the current machine. Source-center polygon tessellation halves the earlier
center-fan prototype's 60,517,058 bytes / 1,251,797 triangles. Neither number is a
hardware frame-time measurement. Instantiating the overview's terrain owner
without a GPU upload gives 39,534,986 CPU bytes plus 31,605,696 declared GPU
buffer bytes. The existing admission preflight reserves twice the resident
allocation: the first detail tile is therefore refused before its own allocation
under the 128 MiB ceiling. This is a measured representation/admission limit,
not a successful full-overview browser or performance gate. The default 32 MiB helper budget is checked
while counting, before height sampling or output arrays, bounding rejected
vertex-map growth too. Source decoding and JavaScript scratch are separate from
typed mesh bytes.

Next pass: preserve these topology/query tests while deriving dry-bank height
from the canonical relief/shore owner, rather than reconstructing an island from
coarse corners that may all be wet. Remove the real bank's source-cell teeth and
make joined normals agree at tile boundaries. Measure full overview retained
query/GPU/transition copies plus detail admissions under 128 MiB before enabling
it globally; use coarser interior polygons if necessary. No budget increase or
second water surface is justified by this checkpoint.

Change ledger: five new shoreline tests pin source pixel-center coverage and
height, full coarse-cell suppression/eviction and wet-level morphing, early
allocation refusal, nearest oblique bank raycast, and diagonal wet continuity
across resolutions/tile cuts. Existing surface/tile/landscape behavior tests
remain unchanged. Focused suite: 15 passed; TypeScript check passed.

Independent Codex code review found no actionable regressions; it independently
ran focused shoreline/tile tests and both web and renderer-lab TypeScript checks.
It did not rerun browser captures.

### Allocation follow-up — 2026-09-15

The preceding overview refusal was a conservative reservation error, not a need
to raise the budget. Admission now retains the old revision and reserves the
possible new arrays: masked coarse indices; mutable fine vertices/color/tint;
incoming source buffers not already held; the new tile's reversed indices and
GPU buffers; and one full copy of all potentially uploaded ranges. Immutable
coarse vertex/GPU buffers and fine topology are shared, not reserved twice.
Existing unchanged geometry arrays remain in the unique-buffer inventory. Fine
morph buffers and upload spans reserve their full size even when only an edge
changes; this remains a conservative bound within the fixed ceiling.

`TerrainAllocationBudget` applies one unchanged 128 MiB ceiling across coarse
build, initial GPU upload, worker generation, and swaps. Traversal supplies the
coarse shore array as retained source storage; tile shore arrays are also counted.
Scheduler source mesh/shore buffers already held by terrain are not added again.
Global geography snapshots remain separately reported, as the architecture
requires. Generation still reserves both output and temporary distance grids;
transferred worker buffers do not acquire a fictitious second CPU copy.

The same full-source overview now admits a coastal detail tile. Before the
coarse shore array is included, measured steady resources are 78,809,079 bytes
and the swap reservation is 86,293,159 bytes, including 7,484,080 upload bytes.
The initial-upload reservation is larger than this later swap: approximately
102.8 MB including the coarse shore array. These are typed resource reservations,
not measured driver-internal allocations or GPU frame times. No global geometry
adoption or bank-quality claim follows from this allocation fix.

Two new memory checks independently inventory old/new unique buffers plus GPU
storage/upload bytes, including retained shore arrays, and run the actual source
overview through shared generation rejection and successful detail admission.
The original retained-query-array test stays green. The real-source regression
previously failed the blanket admission guard; it now retains queryable detail
and masked coarse coverage within the unchanged ceiling.

Independent allocation review found that the campaign fog decorator creates an
additional Float32 vertex attribute. Its CPU, GPU and staging bytes are now
explicitly reserved using the decorator's vertex stride; the memory tests
exercise that attribute on both fixture and full-source geometry. The full-source
initial reservation with fog and the coarse shore array is approximately 108 MB,
still below 128 MiB. The earlier 102.8 MB figure excluded the fog decoration.

### Canonical relief and edge continuity checkpoint

Source height now recovers a raised dry island even when all coarse corners are
wet. Source-gradient normals remove topology-sized shading seams. Adaptive
polygon edges retain shared side vertices; a nonlinear-height regression proves
the former0.1km crack is gone. Only polygons with extra edge points receive a
center fan, and those vertices/triangles are included before output allocation.
The full-overview test grants48MiB to this individual mesh build while retaining
the complete128MiB CPU/GPU/staging assertion, which passes. Tile helper defaults
remain32MiB. Four diagnostic images repeat exactly; fresh review accepts improved
bank continuity but keeps outline steps and residual faceting open. See
[relief evidence](../assets/slice-08/relief/README.md).

### Production builder adoption checkpoint

The production builder now owns conformation, world-stable dry relief and final
vertex shore signals; the worker transfers all topology/coverage arrays and
enforces its caller's remaining generation allowance. The diagnostic route is a
caller of that builder. A narrow-island regression required the existing coast
lattice to sample at least as finely as source pixels. A bank-side regression
prevents dry-side normals from tilting wet faces during morph. The full-source
16 km overview refuses its initial allocation; 32 km preserves source coast detail
and admits a coastal tile within 128 MiB. See [adoption evidence](../assets/slice-08/adoption/README.md).

The production application still uses the legacy renderer pending the planned
cutover. Source-scale shore steps and angular bank faces remain open; functional
adoption does not close this slice's visual acceptance.

### Integrated bounded residency

The source-conforming builder/worker now drives campaign terrain. Packed color replaces redundant overrides; shore data belongs to the mesh. The16-tile working set and32km overview pass full hardware traversal within128MiB. [Layout and timing evidence](../assets/slice-08/layout/README.md) retains the rejected24-tile workload and dense-query profile. [Fresh visual review](../assets/slice-08/adoption/visual/README.md) confirms continuity but keeps stepped outlines and coarse bank shading open. Do not treat this bounded integration as whole-frame visual acceptance.
