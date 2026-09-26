# 2. Prepare campaign camera state once per accepted camera update

## Entry and contract

Proceed only if slice 1 admits the existing-math prepared-state candidate.
Repeated projection and ray queries must consume one prepared camera rather
than rebuild matrices per point. This slice uses current math; it must be useful
and shippable even if the npm package never wins.

## API and ownership

Keep the implementation in `packages/renderer-core/src/camera3d.ts`. Introduce
plain caller-owned state and explicit output functions with these responsibilities
(exact names may follow local conventions):

```ts
createPreparedCamera(): PreparedCamera
prepareCamera(out: PreparedCamera, params: Camera3DParams): PreparedCamera
projectPrepared(out: ProjectedPoint, camera: PreparedCamera,
                x: number, y: number, z: number): ProjectedPoint
rayPrepared(out: MutableWorldRay, camera: PreparedCamera,
            ndcX: number, ndcY: number): MutableWorldRay
```

`PreparedCamera` owns Float32 view, projection, view-projection, and inverse
matrices plus the eye tuple. `ProjectedPoint` owns a mutable three-number NDC
tuple and `clipW`; `MutableWorldRay` owns origin and direction tuples. Outputs
are allocated by the caller. No field aliases mutable incoming pose arrays.
Preparation may allocate the existing matrices once per camera update in this
slice; the required gain is eliminating per-query matrix construction. Avoid a
second generic matrix API merely to eliminate a handful of preparation objects.

`PhotorealCampaignWorld` owns one record and query scratch. Prepare it in the
existing `setFrameCamera` seam before any projection, picking, anchor, bounds,
or drawing consumer runs. Recompute on every explicit call initially: no
identity cache, dirty-bit protocol, global cache, or camera-property observers.
Preserve the existing accepted-pose contract and trace every input/resize path
to that seam. Do not silently use the last drawn camera for pre-draw queries.

Integrate `project`, `pick`, and `anchors`; city-bound and label/marker callers
benefit through `project`. Do not change escaped public result ownership:
results retained by the caller must not later mutate because internal scratch
was reused. Scratch is per world, with caller-supplied storage for any nested
query; no module-global mutable workspace.

Existing one-off APIs may remain for genuine cold callers. They must share the
same projection/ray arithmetic with the prepared path, not maintain a second
formula or a deprecated compatibility facade. Keep the rest of the engine on
its current interfaces. Battle camera, uniform-packer integration, shadow
fitting, label layout, and terrain ray traversal are deferred integrations,
not extra responsibilities of this slice.

## Frozen behavior

Keep column-major matrices, XY ground/+Z up, WebGPU reverse-Z, infinite-far
handling, near-vertical look-at fallback, singular-inverse identity fallback,
zero clip-w handling, and behind-camera rejection. Retain the Float32 rounding
boundaries of the existing construction. CPU coordinates must agree with the
rendered camera within existing tolerances; no shader or GPU layout changes.

CSS/device pixel conversion and aspect selection stay with their current
owners. Do not alter zoom curves, label choices, occlusion tests, terrain
sampling, city-bound clamping, or public picking results.

## Verification and human artifact

Run the focused camera, projection, DPR, and picking tests identified in the
README. Add behavioral coverage for two simultaneous worlds, changed target
tuple contents at the next `setFrameCamera`, pan/zoom/resize before the next
draw, and repeated calls whose retained results stay independent. Include
finite/infinite far, behind-camera points, parallel rays and near-vertical
poses. Use analytic geometry and existing consumer expectations, not a new
test-only projection formula. The probe should show matrix work scaling with
camera updates rather than query count.

Rerun slice 1's workload and full-game hardware liveness/performance comparison.
Keep the change only if the admission policy still passes in production.
Run the existing `campaign-raised-labels`, `campaign-map-alignment`, and
`campaign-visual` scenes, exercising picking during pan/zoom and DPR changes.
Review the actual production campaign and the existing
`/renderer/campaign-composition?ref=1&labels=1` fixture; no new review app.

The visual variable is preservation of screen-space placement and visibility.
Use identical poses and full-frame comparisons, with label/marker/city-bound
crops for diagnosis. Lighting, terrain quality, artwork, and label redesign
are out of scope. Run `compare-screenshots` for matched before/after telemetry;
run unprimed `screenshot-critique` as the **last visual acceptance check**.
Do not re-bless baselines to hide numeric drift. Follow the README's
non-blocking Preview review protocol.

## Decision budget

Delegated: internal names and factoring of shared arithmetic, targeted test
placement, and probe-only counters. Not delegated: broader consumer migration,
cross-frame invalidation machinery, relaxed precision or thresholds, changed
output lifetimes, or npm adoption. Human feedback about label drift, picking
feel, or stale-frame behavior rejects the change regardless of speed.

## Result

Not started. Record the accepted performance/behavior evidence or rejection,
then update the README handoff before ending the pass.
