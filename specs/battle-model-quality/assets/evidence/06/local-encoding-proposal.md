# 06a local encoding probe — proposal, not a format cutover

Source:4216f2dc. No runtime/schema, shader, source-art or generated-asset changes. The renderer skill makes resource ownership and actual operation counts part of this proposal; write-tests keeps the comparison on original-track deformation, not storage-shape assertions. No GPU timing or future shader arithmetic is certified.

## Recommendation for approval

Use one shared **per-clip union of authored key times**, with dense Float32 local T/R/S at those times and explicit per-joint channel STEP bits. Retain timestamps as CPU JavaScript numbers, not Float32 GPU timestamps. Resolve the interval once per active clip sample on CPU, then transport its two sample indices, Float32 fraction and STEP-mask offset. GPU sampling does no timestamp search. Continue to compose local transforms before hierarchy; frozen controller locals use the same GPU packing, but remain controller-owned Float64 on CPU.

This is preferable to a fixed sampling rate: it preserves authored discontinuities and motion corners and is smaller than even12fps for the shared production rig. It is not mathematically identical to original channels: subdivision of the shared sampler's near-parallel normalized-linear quaternion branch is not exactly invariant. The measured residual is reported below rather than called zero.

## Measured alternatives

Scratch command: `node throwaway/local-encoding-probe.mjs`. The probe loaded all three committed catalogs, grouped by resolved skeleton URL, and compared all near-tier vertices through the shared local sampler and matrix composer. Each clip used endpoints,31 interior phases, every union key and key±1e-8seconds. Decode values and interpolation fractions were rounded to Float32; quaternion interpolation and hierarchy reused current CPU math. This is an encoding probe, not a Float32 shader emulator.

Packed local poses use three vec4s (48bytes), retaining all three scale components. Union byte totals include Float64 CPU times and one U32 STEP bitfield per joint/clip; they exclude strings, JSON overhead and common skeleton/inverse-bind storage. Uniform totals are local-pose bytes only. Sparse totals include Float32 channel times/values,16byte channel descriptors and40byte bind locals per joint; they are a favorable GPU-storage estimate, not a complete implementation. Sparse positional errors isolate Float32 **values**, retaining original CPU timestamps for sampling; they do not certify Float32 timestamp boundary decisions.

| Shared source | Bones / clips | Union keys (max/clip) | Union bytes | Union max error, m | Sparse bytes / max error, m |
| --- | --- | --- | ---: | ---: | --- |
| Production0–19, one shared rig |7 /11|39 (5)|13,724|1.809e-6|2,720 /2.475e-7|
| Human40 |10 /1|25 (25)|12,240|1.850e-7|3,456 /0|
| Mounted41 |11 /2|50 (25)|26,888|2.780e-7|6,304 /0|
| Swatches42 |4 /1|25 (25)|5,016|9.300e-8|924 /0|

The four unique rigs total57,868bytes:56,304GPU pose bytes,1,112CPU timestamp bytes and452STEP-mask bytes. Do not multiply the production rig by20 appearances. Current matrix VAT payloads total108,672bytes (51,072production +16,000human +35,200mounted +6,400swatches), excluding metadata.

| Uniform local encoding | Production bytes / max error, m | Human bytes / max error, m | Mounted bytes / max error, m | Swatches bytes / max error, m |
| --- | --- | --- | --- | --- |
|12fps |38,304 /1.152755|6,240 /3.632e-7|13,728 /8.093e-7|2,496 /3.220e-7|
|24fps |73,248 /0.457063|12,000 /2.210e-7|26,400 /2.660e-7|4,800 /1.562e-7|
|60fps |177,072 /0.040573|29,280 /5.674e-7|64,416 /5.534e-7|11,712 /2.557e-7|

Uniform rates can look accurate on the simple Blender diagnostics while missing production motion corners badly. Real-source tests covered3,931,056 vertex comparisons per alternative. A further100 mounted base/upper-body blends (28,800vertices, spine/arm/head mask) had maximum error8.274e-8m. This is source composition, not accepted articulated placeholder gait.

Sparse source channels minimize storage (13,404bytes total) and avoid subdivision residual, but require per-channel interval searches (up to three per joint per active source) or a larger CPU-resolved per-channel payload. GPU Float32 timestamps also cannot preserve the original CPU boundary decision. Do not trade those costs for an unmeasured memory saving when the full union payload is only about57KiB.

## Hostile boundary/subdivision control

One root has a3degree near-parallel rotation and a STEP translation at0.371s; a child has independent LINEAR scale keys at0.29s and0.371s; a third joint is bind-only. The union is `[0,0.29,0.371,1]`. Across1,001phases, maximum position residual was7.117e-7m and maximum quaternion-component residual3.302e-7. Bind-only locals remained unchanged. This explicitly measures the near-parallel subdivision residual and unrelated/simultaneous channel keys.

| Time | Source Y | Decoded Y |
| --- | ---: | ---: |
|0.3709999999 |0|0|
|0.371 |2|2|
|0.3710000001 |2|2|
|1, terminal endpoint |3|3|

Uniform12/24/60fps instead produced Y0.904/1.808/0.520 immediately before the first jump. These are interpolation across a discontinuity, not acceptable rounding errors.

**Important seam:** exact key time selects the right-hand interval. STEP always fetches that interval's left sample, independent of fraction. Immediately before a boundary, Float32 fraction may round to1; it must not cause an early STEP. The final endpoint resolves `A=B=last`, fraction0, instead of relying on a special STEP exception at fraction1. Preserve the CPU sampler's clamped phase1 endpoint even for loop clips; the controller owns wrapping.

## Proposed concrete owner and API

One `soldier-assets` local-animation owner defines the canonical types, bake, interval resolver and CPU decoder. Reuse `localPose.ts` channel/shortest-arc math; promote a seconds-based rig sampler there if needed so baking an exact source key does not divide/multiply its time through phase and accidentally select the preceding STEP value. No second quaternion implementation in a bake helper.

Proposed data seam (names pending parent approval): `LocalAnimation { bones, clips, data }`; each clip retains name, duration, loop and markers, and adds a start offset, exact CPU `times:number[]`, and `stepChannels:Uint32Array` with T/R/S bits0/1/2 per joint. `data` is Float32 local poses, sample-major then joint-major, `[Tx,Ty,Tz,0, Rx,Ry,Rz,Rw, Sx,Sy,Sz,0]`. The live JSON equivalent uses ordinary arrays, as today's internal assets do. Preserve Sxyz: approximate uniform-scale admission is not permission to discard unequal source components.

Proposed calls: `bakeLocalAnimation(rig)`, `resolveLocalSample(animation,clipName,phase) -> { sampleA,sampleB,fraction,stepMaskOffset }`, and a CPU decode into the existing `LocalPose`. The renderer-core shared upload/layout owner consumes this contract for Three and raw; it must not invent a second clip resolver. A frozen source resolves to its owned GPU snapshot slot, without wrapping it in a synthetic clip. CPU locals remain80bytes/joint; GPU snapshot packing would be48bytes/joint, an explicit increase over the earlier40byte tightly packed estimate, to be measured in07.

Lookup/resources: binary upper-bound CPU lookup per active clip sample (at most3comparisons for the current production clips,5for diagnostics), then six vec4 loads per joint per interpolated source plus a STEP bitfield; no search inside the vertex shader. Crossfades/upper-body sources multiply that preparation cost, not per-vertex skinning work. Derive palettes once per visible instance during06b preparation and reuse visible/shadow paths. Static animation data are shared per resolved asset URL; per-instance snapshots/palettes belong to the renderer's atomic preparation/reload lifetime. No readbacks in the hot path. GPU allocation limits, palette packing and synchronized interruption cost remain07 measurements.

## Admission and remaining gates

Union times include0 and duration plus all source keys **within** that interval. Existing placeholder run/attack/shoot/hit/death tracks extend to1s even when the clip duration is shorter; current source sampling clamps at the declared duration. Preserve that behavior and sample its endpoint exactly, rather than silently extending/re-timing clips. Source keys outside the clip are still needed by the original sampler to interpolate that final value, but are not extra playback time.

Propose a1e-5m original-track/decoded vertex gate for these current fixtures (worst measured1.809e-6m); this is not a universal art budget or formal error bound. Authoring/data that misses the declared gate should trigger investigation, not silently enable another representation.06a tests must also pin antipodal shortest-arc keys, single-sample/static clips, source/bind defaults, all STEP sides, clip endpoint behavior and mounted blends. The current probe does not establish exhaustive quaternion or GPU normal/tangent accuracy.

06b must atomically replace old matrix-animation production/raw readers and all internal bundles, while preserving04 material-frame contracts and revalidating the analytic bounds' implementation-specific rounding allowance. Do not add a format version reader or permanent alternate sampler. Before that approved cutover, current runtime assets remain untouched. Parent approval is required for the union-time representation,48byte GPU packing, interval payload and provisional geometric gate; this document does not accept06a/06b or07.
