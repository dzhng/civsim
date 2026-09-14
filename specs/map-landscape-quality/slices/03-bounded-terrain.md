# 03 — Bounded terrain residency and joins

Status: terrain foundation complete; full-game adoption and performance remain in 14–15. Dependencies: [01](01-surface-contract.md), [02](02-campaign-composition-proof.md).

## Contract and owner

Implement the campaign tile residency owner in architecture.md over the canonical CPU field; reuse existing terrain-edge primitives where appropriate. Keep physical battle terrain outside this cache.

Slice variable: **Spatial continuity during loading and level-of-detail changes.**

## Work

Reproduce a two-resolution terrain join on an analytic ramp before real geography, using the geometry-clipmap principle in research.md. Start with cached world-aligned grids and a resident coarse overview; choose stitching or a proven morph, not skirts that hide holes. Add one build worker, bounded queue/residency/upload limits, overlap-aware reuse and explicit disposal. Finished work for a still-needed tile remains useful while the camera moves. Surface/road/entity anchors swap atomically with tile mesh revisions. Detail is filtered below the grid sampling limit. Each location has one active surface: detail atomically replaces coarse coverage, and eviction restores it for rendering, shadows and picking.

## Runnable checkpoint

Planned landscape-traversal scene: overview → Alps close → Italy coast → distant region → return, plus continuous pan/zoom and a stationary hold. Publish residency, pending work, allocation bytes and upload/build timing.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Assert shared boundary positions/normals, no shoreline discontinuities, no resident tile or resource growth after repeated loops, and no static rebuild/upload while idle. Delay/reorder tile completions to test forward progress and stale-result handling. Test coarse → detail → eviction with deliberately different coarse/detail elevations: no overlapping terrain, z-fighting, or ray hits against hidden coarse triangles. Check 01 seating after every swap. Measure the early hardware baseline against architecture.md targets; do not claim a pass from triangle counts.

Crop/mask: Full traversal frames and one join crop at each active resolution. Geometry/material design and final forest coverage remain out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Tile dimensions, level count, stitching internals, and worker implementation are delegated within the declared limits. A GPU clipmap replacement requires measured failure of the simpler approach and a recorded decision; no permission pause.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A larger supported camera range or a different target device class changes the budget, not the world-coordinate contract.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Implementation passes

The composition proof makes two independent contracts explicit. Implement them concurrently, then integrate through the final world owner:

- [x] Scheduling: bounded asynchronous work, frame-only admission, overlap retention, eviction and failure behavior. See [scheduler evidence](../assets/slice-03/scheduler-notes.md).
- [x] Source/worker: one classified snapshot, one worker, shared source sampling, transferred outputs and allocation preflight. See [worker evidence](../assets/slice-03/scheduler-worker-notes.md).
- [x] Joined presentation: indexed coarse coverage, union-boundary morphing, shading continuity and the actual worker-driven fixture. [Presentation evidence](../assets/slice-03/presentation.md) records exact repeats and the fresh visual verdict.
- [x] Anchor integration: campaign objects, roads, labels, selection and DPR1/DPR2 picking follow detail admission and eviction. The fixture deliberately raises an army by 8 km.
- [x] Real-world terrain integration: camera-driven requests over actual geography, bounded geometry/query/GPU/transient allocation accounting, repeated traversal, exact captures and terrain-only hardware timing. See [traversal evidence](../assets/slice-03/traversal/README.md).
- [x] Terrain acceptance: unprimed critique of the merged terrain. Full UI/scenery hardware acceptance remains open under [15](15-acceptance.md); terrain-only timing does not satisfy that later gate.

This subdivides verification inside 03; it does not add a second tile owner or change the fifteen-slice feature scope. The initial regular-grid approach remains the selected implementation; do not introduce clipmaps without measured evidence.

The settled-view fresh critique and merged repeat are recorded in [traversal evidence](../assets/slice-03/traversal/README.md). This closes the bounded terrain foundation. Final landscape appearance, scenery residency, production UI and full-game hardware timing remain explicit contracts of their owning later slices.
