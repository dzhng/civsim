# Landscape ownership

Campaign and battle share appearance policy while retaining their own meaning.
Campaign geography uses strategic kilometre coordinates; battle terrain uses
physical metres, existing recipes and simulation rules. The campaign composes
through Three and battle through TypeGPU. Neutral inputs and assets are shared;
GPU resources and shader expressions belong to their backend.

This separation avoids making a rendering change into a new map generator,
save format or gameplay schema. Matching character does not require matching
geographic detail or putting both worlds on the same renderer.

## Owners and boundaries

| Concern | Authority | Boundary |
| --- | --- | --- |
| Geography and physics | Campaign source adapter; battle simulation terrain | Visual detail never rewrites physical heights, passability or deployment |
| Rendered surface | Neutral terrain mesh/query contracts | Geometry, draping, grounding and picking agree with presented triangles and revision |
| Relief and materials | Shared terrain policy and rock asset | Source cover retains its meaning; Three and TypeGPU own shader implementation |
| Planting | Campaign scenery and battle terrain-scenery producers | Shared deterministic candidates/assets; map-specific eligibility, reservations and budgets |
| Campaign residency | Production campaign terrain-tile owner | Overview coverage persists while bounded detail is admitted |
| Environment | Neutral environment policy | Backend-local lighting, shadows and output; no private duplicate atmosphere |
| Composition | Production campaign world; TypeGPU battle scene | One camera and composition per world, including natural previews |
| Commands and presentation policy | Existing application frame, input, labels and cards | Rendering consumes live identity without becoming a second command/state owner |

The source owners live in `packages/game-renderer/src/`; backend adapters live
in `packages/photoreal-renderer/src/` and `packages/battle-renderer/src/`.
The production campaign application boundary remains `web/src/campaign/`.
Those modules own concrete types and current tuning values; this document does
not prescribe parallel APIs.

## Source signals and presented geometry

Source raster orientation and units are normalized at their input boundary.
World-aligned sampling preserves geographic identity across windows. Visual
height exaggeration is separate from unit conversion and physical terrain.

Presented-surface queries intersect the active mesh rather than assuming a flat
plane or silently switching between analytic and rendered heights. Coarse
coverage remains the fallback while detail is missing. Anchors and queries
follow surface revisions when detail changes; hidden coarse triangles must not
win selection beneath active detail.

Material coverage is decoded before interpolation. Numeric categories such as
grass and forest must not blend through an unrelated rock ID. Physical source
categories remain unchanged; visual meshes carry their own continuous signals.

## Water semantics

Wet coverage, body identity, shore distance and depth are distinct concepts.
Campaign shore distance supplies a bounded visual depth proxy, not measured
bathymetry. Battle retains its physical body/coverage inputs. Strategic
territory-capable land and rendered water masks have different purposes even
when derived from the same source adapter.

Coast geometry, surf and render-land queries follow canonical source boundaries;
a tile edge never becomes a shore. Ocean joins retain field-edge samples.
Display-authored colors cross the linear-light boundary once. Water motion uses
the owned frame clock and loses unresolved detail at distance.

## Bounded work and lifetime

A resident overview supplies coverage beneath a finite detailed working set.
One scheduler owns demand, useful cached work, admission and eviction. The
builder owns allocation estimates, including scratch and transfer peaks. A
single admission updates the affected neighboring boundaries and coarse
coverage together; allocation telemetry includes that work.

The retained engineering constraints are a single in-flight terrain build,
no more than one new tile admission per animation frame, and a128MiB
feature-owned terrain budget. Shared geography, scenery and shadows are separate
allocations. Actual residency bounds and accounting live with the tile owner;
the implementation uses a smaller detailed working set than the original
maximum rather than erasing overview geography to fit.

Idle views do not repeatedly regenerate unchanged terrain or upload unchanged
static instances. Permanent source failures are reported without retry loops;
temporary admission blocks can clear when camera demand changes. Borrowers
release before shared images, pending readbacks settle before renderer teardown,
and disposal attachments must not retain retired worlds.

## Evidence boundaries

Correctness captures use the existing deterministic scene/snapshot harness;
performance records identify the actual browser, adapter and workload. The
selected campaign target is p95 frame time at most33ms with full UI at1280×800
DPR1 and no warm terrain admission frame above100ms. Battle retains its existing
33ms workload gates; DPR2 input and appearance are separate correctness checks.
These are engineering targets, not a claim of universal hardware performance.

Current native measurements do not supply a missing pre-change comparison.
Without a genuine comparable archived full-game baseline, paired release
performance remains unverified. Likewise, reproducible images prove stability,
not reference-equivalent art. The user's final matching-character scope retains
known appearance limitations in the [integration record](assets/closeout-status.md).

## Retained development surfaces

Natural landscape previews call the production composition. Clay and isolated
fixtures remain explicit diagnostics. Obsolete whole-map raw GPU owners and
unconsumed helpers are retired; live raw model/UI tools retain their consumers.
Reusable CPU road, territory, label and model data do not need replacement just
because their former renderer was removed.
