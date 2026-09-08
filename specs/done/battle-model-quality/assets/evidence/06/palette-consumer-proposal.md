# 06b palette preparation — source-level design probe

Proposal only: no runtime cutover, GPU execution, performance acceptance or art change. Inspected main `0087f163`, installed Three sources, and the source agent's pending `localAnimation.ts` API accompanying `65c22f2b`. Names below are proposed, not shipped APIs.

## Recommended ownership

Keep the approved `soldier-assets` local-animation encoding and resolver unchanged. A small `renderer-core` playback-packing owner consumes `SoldierPlayback` and `resolveLocalSample`, manages immutable frozen-source residency using the source owner's `packLocalPose`, and produces per-rig compact worklists. It owns the transient word layout, not another animation format or action clock. A shared WGSL function body in that owner performs local interpolation, bounded composition and hierarchy evaluation. Three and raw wrap that same function with their own resource/dispatch APIs; neither independently reimplements quaternion math.

Group static resources by the loaded **rig + animation identity**, not appearance ID. The existing loader shares resolved URLs, including the production roster's common rig/animation. Different inverse binds must never share a rig palette merely because animation bytes match. Appearance-specific upper-body masks are resolved once to joint-index masks in static metadata and referenced by each instance's control record.

Three keeps culling/LOD ownership in `PhotorealCrowd.upload`. After the union of camera/shadow frusta is tested, append each visible mesh instance exactly once to its rig worklist, regardless of mesh tier/material bucket. Its bucket receives the corresponding palette-instance index. Far-only instances do not allocate a dynamic palette: their fixed manifest pose continues through the shared CPU local evaluator and weighted mesh poser at atlas creation.

Raw's existing mesh grouping consumes the same packer after its own input selection. Manual diagnostic clips with no action presentation produce a single base clip sample through the same canonical resolver, not a legacy VAT path or synthetic presentation binding.

## Proposed transient resources

| Resource per rig group | Layout / update | Ownership |
| --- | --- | --- |
| Local samples | Approved 48 bytes/joint/sample; static | Shared loaded animation |
| Integer metadata | STEP masks, parents and appearance mask tables; static offsets | Packed once from source owners |
| Inverse binds | Column-major mat4, 64 bytes/joint; static | Shared loaded rig |
| Resolved controls | Five 16-byte words per compact visible instance; refreshed with submitted playback | Frame preparation |
| Frozen sources | Approved 48 bytes/joint; upload new/re-entering source only | Bounded renderer residency pool |
| Derived skin palette | Column-major mat4, 64 bytes/joint/visible mesh instance; GPU writes | Frame preparation, shared by beauty/shadow |

This is six storage bindings in compute; rendering needs only the read-only palette. Retain all four matrix columns initially to match the weighted skin owner and avoid a simultaneous affine packing change. Shader local world matrices are temporary per invocation, not another persistent GPU animation buffer.

The control header carries source-kind/overlay-mode flags, base and upper blend weights, and upper-mask offset. Four remaining words carry base source/destination and upper source/destination descriptors. A clip descriptor is exactly `ResolvedLocalSample` (indices, bitcast Float32 fraction, STEP offset). A frozen-source descriptor addresses a pool slot and is explicitly tagged by the header; it is not encoded as a fake clip. Upper destination “base” is explicit and consumes the already evaluated base joint local. Unused descriptors are zeroed and never sampled. Pack via shared Uint32/Float32 views so indices are not accidentally converted through Float32.

Use a palette-instance index in the mesh instance payload; keep the existing transform/faction/death fields. It replaces obsolete clip-start/frame-count/phase transport. The bucket knows its rig bone count. An existing float slot can represent this index exactly at the admitted storage capacity, but that bound must be asserted; a new unsigned attribute is unnecessary unless the bound fails. CPU debug stats must call this **submitted** state. Only a bounded diagnostic readback can certify GPU palette values.

## One invocation per instance

Dispatch one invocation per compact instance. Within it, loop the parent-before-child source order (already required by `localPoseToJointMatrices`):

1. Decode each needed clip local from A/B, selecting A independently for STEP T/R/S even if the Float32 fraction rounded to one; terminal A=B stays exact.
2. Interpolate the base pair, honoring exact weight-zero/one semantics.
3. On masked joints only, interpolate the optional upper pair; an exiting upper destination uses the **evaluated base**, not its destination clip. Unmasked horse/pelvis/legs keep base locals.
4. Form local TRS, multiply by the previously computed parent world matrix, then write world × inverse-bind into the output palette.

A function-local `array<mat4x4f, B>` sized by the rig's admitted joint count avoids dispatch-per-hierarchy-level, global synchronization, or repeated parent walks per vertex. The shared WGSL function can be specialized by bone count; do not create one shader variant per appearance. Workgroup size is a measured scheduling choice, not an art bone limit. Register/private-memory pressure for future larger skeletons is an explicit 07 risk; this design is not yet a measured win over other compute scheduling.

The visible and shadow material use the same weighted palette columns. Keep 04's normal/tangent linear transform, vertex normalization and fragment mapped-frame rules unchanged. The palette is computed before rendering once, never again inside a shadow callback or per cascade. A paused redraw may reuse a palette when playback/worklist are unchanged; a changed culling/LOD worklist still needs remapping even at the same simulation time.

## Existing platform seams and limits

Installed Three `Renderer.compute()` updates bindings, records compute and submits before the subsequent render. `WebGPUBackend.finishCompute()` submits its command buffer; queue ordering supplies the compute-to-render dependency. `computeAsync()` merely initializes then calls compute: it is **not** a GPU completion wait. Use one compute-node array for active rig groups where practical, not one queue submission per soldier.

`StorageBufferAttribute` plus `storage(...).toReadOnly()` can expose one allocation as a writable compute resource and read-only vertex resource. The existing blade-field route demonstrates storage uploads and explicit pre-render compute. Three's `wgslFn` parser recognizes pointer arguments; `FunctionCallNode` passes their address, and `WGSLNodeBuilder` exposes storage arrays through `.value`. That provides a plausible wrapper for the shared WGSL function, but source inspection is not GPU compilation proof. First implementation probe must verify pointer/access-mode emission and actual storage reads on the installed version, without private backend-buffer extraction.

Raw already exposes `FrameGraphCommands.precompute(encoder)`, before all render passes in the same command encoder. Its adapter can record the identical palette kernel there. No new frame graph or renderer shell is required. Raw and Three need not share literal GPUBuffer objects or devices; they share the canonical layout, resolved inputs and kernel semantics.

**Disposal is an unresolved feasibility gate.** Installed `BufferAttribute.dispose()` only dispatches an event; source and built-code inspection did not find a standalone storage-buffer listener. The disposal callback in `WebGPUAttributeUtils` belongs to `ReadbackBuffer`, not the uploaded storage attribute. Geometry disposal deletes its rendered attributes, which is insufficient proof for compute-only storage. The first probe must count actual GPUBuffer creation/destruction; do not assume the existing grass attribute-disposal pattern releases every palette resource. If the installed public lifecycle is insufficient, propose one narrow renderer-owned adapter through the existing backend seam, with cache cleanup proven, rather than a Three upgrade or fake disposal geometry. Compute nodes separately require disposal to release pipeline/binding caches (`Renderer.compute` installs their listener). Raw destroys its owned buffers and releases pipeline/bind-group references. Never overwrite a live allocation's array length in place; grow with fresh resources and rebind consumers.

## Snapshot and replacement lifetime

Pool identity is the immutable controller `source.locals` object within the prepared rig generation. Each frame first collects required frozen references, retains existing slots, then reclaims absent slots before allocating newcomers. A frame may require at most two distinct frozen sources per visible instance; sharing a reference can reduce that. Invisible sources may be evicted and re-uploaded on re-entry. Never mutate controller arrays or retain an unbounded strong-reference map of every historical interruption.

Reuse slots only after the previous frame's compute/render has been submitted. Queue writes for the next frame occur afterward on the same queue; no per-frame fence/readback is required. A later render must not consume a prior frame's palette after its slot inputs have been overwritten. The adapter therefore owns upload → compute → render ordering, including shadow submission, as one frame transaction.

Initial/reload preparation allocates static resources and any known capacity, compiles/dispatches a small valid workload, then awaits GPU admission error scopes before exposure. As established in 04, Three's nested pipeline scopes may log and consume errors; exercise actual invalid pipeline/command usage, not only a mocked rejected scope. Restore renderer state before awaiting. Admission completion is not presentation or full queue completion. On rejection dispose all pending resources and leave the last good crowd installed; on success keep the existing late active-pose revalidation before swap.

### Actual capacity owners and alternatives

`PhotorealCrowd.uploadBucket` currently grows synchronous CPU instance arrays to `max(required, old*2, 256)` and replaces geometry attributes; Three creates/uploads their GPU buffers during rendering. There is no live pending-capacity state. `PhotorealBattleWorld.drawInstances` synchronously uploads, and `render` submits immediately. `setStatic` records soldier count and clears the current draws; it does not reserve resources or await readiness. The frontend renderer only queues static data while initial world creation is pending, then applies it synchronously. Reinforcement `battleTerrain.refreshStatic` follows this same synchronous call path. Raw `GrowableBuffer.write` synchronously allocates a replacement, destroys its predecessor and tells the caller to rebuild bindings. These are the existing behavior and ownership seams, not an async transaction framework.

The smallest candidate is therefore ordinary synchronous GPU buffer growth with deterministic storage-limit checks and coherent rebinding before the next submission, following the existing frame owner. It must handle reinforcement and workbench count growth without truncation. Actual GPU out-of-memory/validation failures are distinct from synchronous size rejection: frontend currently installs a device-lost fatal surface; a recoverable OOM/last-frame guarantee is not already supplied by that path. Probe the error behavior and make the failure policy explicit rather than claiming synchronous `createBuffer` proves admission.

An alternative is reserving a measured initial capacity inside the established async world/reload preparation, retaining normal synchronous growth beyond that capacity. That does not require changing `setStatic` or delaying every frame. An awaited live-growth transaction, stale-frame policy, or permanent roster cap would be a **new contract requiring parent approval**, not a recommendation adopted by this document. Compare initial reserve slack, doubling peaks, reinforcement growth and device-limit failure during 06b/07 before choosing. No hidden truncation or synthetic readiness framework is authorized here.

## Costs and the first proof

At 30,000 visible seven-joint mesh instances, proposed palette bytes are 13,440,000; worst-case two GPU frozen sources are 20,160,000; resolved controls are 2,400,000. CPU controller snapshots alone can reach 33,600,000 payload bytes, excluding JS array overhead. Three storage attributes may retain CPU backing arrays for GPU output, adding a palette-sized CPU allocation; record that instead of reporting GPU bytes as total memory. Group capacity slack and old+new reload peaks are additional. These are arithmetic estimates, not 07 acceptance.

The first actual GPU proof should use the authored mounted diagnostic and a hostile STEP rig through both adapters: compare read-back skin matrices and weighted position/normal/tangent against the approved CPU decoder/composer at fractional phases, exact STEP sides, endpoint, crossfade, frozen interruption, upper exit toward moving base, and death. Include a child whose parent index is not adjacent. Run the same palette through beauty and shadow; ensure vertex WGSL contains no source sampling or hierarchy. Then test snapshot replacement/reuse, invisible re-entry, capacity growth, rejected preparation and reload rollback with bounded live-allocation counters.

The source agent owns 06a encoding/error/bounds. The first 06b probe owns kernel and storage feasibility; the coherent 06b cutover rebuilds all bundles and removes old matrix-animation readers from Three/raw/far. 06c then owns production temporal snapshots. Any hierarchy precision allowance must be checked against source bounds; no new renderer safety pad is chosen here.
