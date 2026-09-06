# 06b CPU playback preparation

Prepared CPU prerequisite, not runtime cutover or GPU admission. The [shared playback packer](../../../../../packages/renderer-core/src/playbackPacking.ts) consumes the real timeline's playback without choosing actions or advancing clocks. The source local-animation owner supplies clip resolution and frozen-pose packing; no second animation format or quaternion sampler is introduced.

The kernel owner confirmed the80byte header/four-descriptor layout and consumes exported offsets/flags. Clip STEP offsets remain relative to the canonical source mask array; upper-body mask offsets are absolute in the kernel's static metadata table. The header explicitly identifies an upper destination equal to the **evaluated current base**, including any base crossfade, rather than its destination clip. No GPU buffers, devices, allocation sizes, growth policy or async scheduler are owned here.

## Residency and submission boundary

One packer belongs to one loaded rig+animation generation. It uses immutable frozen-local object identity, not appearance IDs or pose-value hashing. Each plan first collects the visible references, retains existing slots, and reuses absent slots for newcomers. The committed strong-reference map retains only that committed frame's sources; the next pending map retains only its proposed sources. A frame has at most two distinct frozen sources per input instance. Shared references may use one slot; equal values in different immutable objects remain independent identities.

Preparation is staged: only commit after the adapter successfully queues uploads and the frame's compute/render submission. Discard, failed preparation, a superseding plan or reset cannot make an unuploaded snapshot appear resident. There is one pending plan, not a retry manager. Reset invalidates old plans; a replacement packer cannot commit another generation's plan. The adapter still owns same-queue ordering and must not render an old palette after overwriting its slot inputs.

An abandoned plan may already have queued writes before a later failure. Discard/supersede therefore invalidate committed identities occupying any upload slot in that plan, while preserving unaffected slots. A retry uploads those possibly overwritten sources again. This is intentionally conservative even if no writes actually landed; it does not promise rollback of queue writes. During an upload/submission transaction, adapters must not interleave another plan's writes; the asynchronous admission/growth policy remains outside this owner.

Retained slots are stable, so a one-reference frame can still require a two-slot span. Do not report live-reference count as GPU allocation. Lowest-free-slot reuse bounds slot-address high water by twice the peak committed visible-instance count, rather than accumulated historical interruptions. Eviction followed by re-entry uploads again; retained snapshots do not upload every frame. No GPU shrink/compaction policy is selected.

## CPU/storage accounting for07

For N inputs, the control array is80Nbytes; its Float32 view shares the same buffer. Each preparation creates a visible-reference Set, next-residency Map and occupied-slot Set; these copy references/indices, not controller arrays. Committed plus pending maps can hold references for two distinct frames until submission. The old pending plan is released when superseded; there is no historical-source cache. JS collection/object overhead remains unmeasured.

For each new/re-entering source, the shared source packer reads the controller's readonly numeric array directly and allocates48bytes/joint in the upload. It also accepts source Float64 local poses, with byte-identical packing; there is no intermediate Float64 conversion or temporary subarray view. Retained sources allocate neither copy. At30,000visible seven-joint instances and two new frozen sources each, that is2,400,000control bytes and20,160,000upload payload bytes, excluding controller storage and garbage-collection overhead. These are arithmetic allocation totals, not measured simultaneous peaks or frame times. The reported peak committed slot span is CPU addressing telemetry, not a claim that GPU buffers have that capacity or were freed on reset.

## Changed-test ledger

New pure tests in `playbackPacking.test.ts`; no existing assertions or baselines changed. The first test failed with missing `prepare`, then passed after the staged packer was implemented.

| Surface | Previous coverage | New observable guarantee |
| --- | --- | --- |
| Aborted preparation | No shared playback upload stage | Retrying an unsubmitted plan still emits its required snapshot; committed retained references emit no repeated upload. |
| Visible identity lifetime | No bounded shared residency | Shared references deduplicate, equal-value distinct objects do not; invisible re-entry uploads, holes reuse and100new identities do not accumulate slot address space. |
| Reset/reload/rejection | No generation-scoped plan | Superseded/reset/cross-generation plans cannot commit; malformed replacement input leaves committed residency intact. |
| Partial-upload abort | Initial staged implementation trusted uncommitted slot contents | Queued C overwrites committed A's slot before failure; discard and supersede both force A's re-upload. Observed red decoded22.75 instead of7.75; fixed retry restores7.75 and does not re-upload unaffected B. |
| Snapshot packing input | Only Float64 poses accepted; immutable arrays required an80byte/joint temporary conversion | Direct immutable-array input and Float64 input yield identical bytes, preserve shape/Float32-finite rejection and avoid conversion/view allocations. Observed red: `locals.subarray is not a function`. |
| Upper exit | No resolved control transport | A synthetic base crossfade yields7.75 and upper exit yields13.875; incorrectly targeting the base destination would yield10.5. Two independent frozen lanes and explicit current-base mode are exercised. |
| Real timeline output | Timeline CPU pose tests only | Authored mounted geometry agrees with decoded80byte records through entry, fractional sample, upper exit during base crossfade, hit interruption and held death, within the approved1e-5m source gate. |
| Compact ordering | No per-rig control records | Two distinct inputs decode to7.75 and1.25 in their original record order; unsigned metadata survives beyond Float32's exact-integer range. |

Independent review `01a075db-9765-7612-98d7-4653a00aa6d0` found the partial-upload abort defect above; it was reproduced and fixed rather than dismissed. Follow-up `01a075e0-4bd7-76f3-8f82-7cab079af487` confirmed selective invalidation and both abort paths, and returned clean. All8focused packer tests,260web tests and typecheck pass. No GPU/browser pass is claimed: kernel decoding, upload→compute→beauty/shadow ordering, actual allocation/disposal and capacity admission remain the renderer integration owner's gates.

Direct-packing follow-up review `01a075e5-2bca-7273-990e-e371004d89b2` confirmed unchanged byte ordering, padding and conversion semantics. Its test-registration finding was resolved by placing the new byte-equivalence/admission assertions in the existing standard Vitest suite rather than the source runner awaiting integration. All9focused tests,261web tests and typecheck pass. The all-tier source test retains exactly its prior deformation metrics; no source or runtime artifact changed.
