# Real geography traversal evidence

The traversal now drives the existing campaign composition and tiled-surface
owner over the loaded campaign raster. World-aligned identities keep overlapping
work useful; a coarse whole-map surface remains resident when requests change.
The view policy prioritizes the nearest visible region and deliberately leaves
more distant visible ground coarse when the working set exceeds the detail cap.
This is a bounded residency checkpoint, not uniform detail across the viewport.

## Allocation and performance scope

The terrain owner counts distinct live typed-array backing buffers, including
raw sources, presented query revisions, geometry attributes and reversed GPU
indices. GPU geometry storage is counted separately. Query arrays can differ
from unchanged geometry arrays; the memory regression pins that case.

Admission reserves a conservative second live revision plus incoming source,
replacement geometry and upload staging before mutation. The route also reserves
scheduler payloads, coarse shore storage and worker-generation scratch. These
reservations intentionally overcount shared references. The peak is an allocation
upper bound, not a process RSS measurement. The worker builds the overview before
any terrain GPU allocation exists, with a separate boot preflight.

The final hardware run on Apple M5 Pro (20 GPU cores, OS system profiler),
Chrome 153, WebGPU `apple / metal-3`, 1280×800 DPR1 measured:

- 180 continuous pan/zoom samples: p95 16.67 ms.
- 15 warm admissions in that sweep: maximum associated frame 16.67 ms.
- Repeated Alps returns: exactly 46,311,224 bytes of live owned terrain CPU/GPU
  geometry and query storage, with 24 resident tiles.
- Maximum conservative terrain allocation reservation: 110,950,868 bytes
  (105.81 MiB), below the 128 MiB limit.
- Coarse generation reservation: 64,449,365 bytes.
- DPR2: a 2560×1600 backing canvas retained the same bounded request policy.

Global source snapshots are reported separately (13,739,366 bytes for the two
classified copies). Generated scenery is not rendered in this terrain checkpoint;
its reported 418 instances describe only the overview payload, not detailed
scenery. Scenery JS object allocations and the existing world shadow/environment
resources (including the owner’s 1024×1024 directional shadow map) are outside
this terrain budget. The route has no gameplay UI or
entities. Consequently these measurements are **not** full-feature memory or
full-UI hardware acceptance; those remain production integration gates.

## Review and remaining appearance work

All five full frames were inspected, including enlarged terrain/coast crops.
The initial Alps admission and the return after eviction have zero different
pixels at the same camera/time/adapter. The overview exposes the rectangular
source extent; regional ground is still soft, sparse and uniformly colored.
The no-hole residency result does not certify mountain, material or ecology
appearance. Those belong to their independent slices. Both arrival and return
are equally incomplete against the visual reference; returning does not make
the rendering worse.

The canonical scene captures use the bundled headless SwiftShader path. All
five snapshots repeated with zero differing pixels; all scene checks passed.
[Hardware telemetry](hardware.json) and [SwiftShader telemetry](swiftshader.json)
record the complete runs. [Comparison telemetry](comparison.json) records arrival versus
return. [The looping traversal](traversal.gif) shows the checkpoint sequence.
Fresh unprimed review accepts spatial continuity in the settled views: no internal cracks, holes, rectangular patch joins, dropped regions or broken coastlines. The rectangular outer boundary is the source extent. The five-frame GIF does not establish transient-frame behavior; the continuous pan/reversal probes and frame-atomic surface contract provide separate evidence.

Merged verification passes all 464 tests and TypeScript. All five canonical snapshots remain exactly identical, with repeated traversal, idle and DPR2 checks green. The only integration edit updates a new test import to the neutral shader owner; no rendering behavior changes.

Independent Codex review caught the retained query-array accounting omission;
it was fixed, and its new test was observed red on the omission and green after
restoration. Its only other finding concerned local dependency/WASM symlinks;
those machine-specific setup artifacts are excluded from the commit.

The shape review kept one scheduler, one worker and one presented surface owner.
No terrain generator, source appearance, shader math or production battle path
changed. Request policy is separate from residency because the cache cannot infer
the camera's priorities; the route only composes these existing owners.
