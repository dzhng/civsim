# Live battle overlay ports

The candidate layers cover the production ground/effect lines, debug triangles
and ground rings. They share CPU writers, retained staging, byte-capacity policy
and shader algorithms. Each runtime owns its actual buffers, pipeline and draw
commands. The dedicated control also uses that runtime's frame, sky, post and
opaque fixture pipeline; TypeGPU/vgpu do not render through the raw fallback.

The [control](../../../../../apps/battle-perf-lab/src/raw/overlay-check.ts) retains
the visible raised block and matched unoccluded view. Ground lines and rings read
depth without writing it; effect lines and triangles preserve their source overlay
ordering and disabled depth test. Source display colors pass through the same
transfer function and alpha blend before scene grade. No production resolution,
sampling or quality setting changes.

All six one/four-sample controls pass the existing 1/255 output-channel gate,
with maximum error 0.001220703125, exact active counts and no GPU/browser errors
or live candidate buffers/textures after teardown. The counts in each report
separate active work from retained capacity. The [decoded identity check](review/unchanged-case-identity.json)
confirms all unchanged isolated native cases are pixel-identical to the prior
visible-occluder captures, including both sides and both sample counts.

## Ownership and failure behavior

TypeGPU uses typed pipelines, public render commands and library-owned packed
byte buffers bound through its public vertex-layout API. Using public unwrapped
handles for those bindings retains the existing byte-growth policy without
rounding capacity to a whole vector record. Its uploads copy active payload spans;
vgpu uses public core-buffer writes and a live GeometryLike buffer getter. Both
keep their pipelines through growth, shrink and empty uploads. Initial TypeGPU
vertex resources materialize while admission scopes are open. Library pipeline
caches follow their owning context's lifetime.

Retained preparation runs inside the upload guard. The
[staging negative control](diagnostics/staging-before-guard/report.json) shows why:
rejecting a concurrent call after preparation still let it change the accepted
upload's alpha when only the position/color buffers grew. The restored control
preserves the accepted image. CPU copies also finish before GPU mutation, and
uncommitted replacements remain covered by cleanup. The
[payload-allocation negative control](diagnostics/payload-before-cleanup/report.json)
observed two stranded buffers after an injected third-copy failure; the corrected
TypeGPU run keeps the live count unchanged and retries successfully. These are
controlled failure injections, not claims about real hardware OOM behavior.

## Scope correction: retired markers

The earlier native overlay capture populated a legacy marker-billboard API that
production never used. A repository caller audit found only empty uploads in
`PhotorealBattleWorld`; its real far-LOD soldiers already use crowd impostors.
The empty marker layer, its new native wrapper and test-only material policy are
removed. Actual crowd L3 rendering and its public `lod.impostors`/`markerLayer`
reporting remain required and unchanged. The obsolete always-empty `markers`
stat is removed; soldier totals still count the real crowd instances.

Historical marker images remain under the [original native evidence](../../02-raw/overlay/README.md).
They demonstrate the retired API, not an additional complete-scene requirement.
[The change ledger](change-ledger.md) records the fixture changes explicitly.
This pass is a component control, not a complete battle backend, temporal visual
acceptance or a performance result.

Run the [Vite control config](../../../../../apps/battle-perf-lab/src/raw/overlay.vite.config.mts)
and [verifier](../../../../../apps/battle-perf-lab/src/raw/verify-overlay.mjs).
`OVERLAY_CHECK_URL` supplies the backend/sample URL and `OVERLAY_EVIDENCE_DIR`
keeps each result separate. No public-asset copying is required.
