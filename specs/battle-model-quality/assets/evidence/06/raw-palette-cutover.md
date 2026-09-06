# Retained raw local-pose consumer

This is the raw portion of 06b, not temporal/art acceptance or a performance verdict. The retained campaign renderer and raw lab now submit the canonical resolved playback through the shared palette kernel. Each loaded rig/animation identity owns its GPU data; each submitted mesh occurrence receives one palette reused by its opaque color/depth vertex invocation. There is no separate articulated raw soldier shadow pass today: grounding decals are unchanged. Three's shadow acceptance is a separate consumer proof.

## Evidence

The [corrected-angle repeat](raw-palette-corrected-kernel.json) uses shared kernel
SHA256 `f1fd1a383afb5c4b59b4a8301f31c9cdf737fa9c731ee4549ccd20dfc79e274d`.
All45 checks across the ten poses pass: RGB error0, depth error at most1.863e−9,
and331 buffers destroyed once, with no page/GPU errors. This repeat follows the
near-unit quaternion correction; it is not evidence from the earlier angle.

The final strict repeat at `2026-09-06T09:47:16.540Z` passed all 89 checks across the three scenes, with no failures or page errors. All five material snapshots differed by **0 pixels**. Full TypeScript checking and the 16 focused CPU tests passed with coherent verification copies of the other lanes. [Measured results](raw-palette-results.json) retain the numerical proof, negative control and strict-repeat summary.

The addressable `raw-pose-palette` scene drives the actual `SkinnedCrowdPipeline`, not an alternate skin shader. Ten authored human/mounted cases cover manual fractional/end samples, base crossfade, frozen base, mounted overlay, frozen overlay exiting toward the evaluated base, snapshot growth/shrink, and concurrent distinct animation data with a sparse shared appearance. The CPU comparison poses the source geometry using the canonical local evaluator and submits it through identity joints in the same raw renderer.

- Actual foreground coverage:3606–11614 depth texels. Every case matched CPU RGB exactly; maximum depth error1.863e−9 against the unchanged1e−6 gate.331 tracked GPU buffers were each destroyed exactly once; no GPU validation errors.
- Growth to three frozen sources uploaded1440 bytes, including the retained source into the fresh allocation. Shrinking back to that source uploaded0 bytes and retained the capacity high water.
- A deliberate animation-alias mutation kept real bodies visible but made the two affected visible comparisons differ by250 channel values and depth by about0.01074. Restoring the correct resources returned them to green. Resource counts alone are not the oracle.
- The first depth readback correctly failed its non-empty gate: the production shell discards depth after its last consumer. The test now retains that same attachment with `store`, and adds copy capability for readback only. No production attachment policy or shader is changed.
- The public raw failure tracer catches an error after an earlier rig upload, then attempts compute/draw. Removing fail-closed submission makes it fail with `partial compute submitted`; the guard suppresses the partial crowd, and a complete subsequent upload restores drawing. Resource tests also cover checked device limits, failed queued snapshot writes, binding failure, residency recovery and idempotent disposal.

Commands use `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5196 node scene.mjs` from `web`, selecting `raw-pose-palette`, `per-class-animation`, and `soldier-materials`. CPU gate: `vitest run tests/rawPosePalette.test.ts tests/skinnedPipeline.test.ts tests/playbackPacking.test.ts tests/soldierSkin.test.ts` (16tests). Shared source/Three verification copies are excluded from this raw commit; integration must land all consumers and the source format together.

## Visual scope and independent review

All retained raw scalar, texture, mapped-normal and degenerate-frame controls passed. Bent CPU prepose and mirrored-UV controls remained exact; yaw interior maximum1, corpse-roll interior maximum3 stayed inside their existing gates. No tolerance was changed.

Five material snapshots changed only because the navigation item now says `per-class-animation`. Each full image had8372 changed-byte pixels in its top42-pixel navigation band and **zero changed pixels below it**. Their body, lighting, terrain, camera and sidebar are byte-identical to the prior snapshots. The refreshed baseline set is limited to authored, blue, metal, posed-normal and Blender-checker material shots.

Fresh neutral full-image/crop review reported:

> The only clear difference is the top navigation: A shows truncated `per-class-vat`, while B shows the complete `per-class-animation`.
> B’s longer label shifts `soldier-materials` and every subsequent tab to the right. Consequently, slightly less of the final tab is visible at the far-right edge.
> No visible differences in the character model, pose, materials, lighting, terrain, sidebar, or framing.
> No new rendering artifacts detected. Text readability is otherwise equivalent.
> Verdict: B fixes one navigation-label truncation but increases right-edge navigation overflow/clipping.

Disposition: the old token was not actually truncated; the longer-label reflow and increased right-edge overflow are real. The existing navigation is horizontally scrollable, and a browser assertion reaches its final link then restores the original scroll position before capture. Accurate naming is accepted with that inherited overflow disclosed, not as a UI or model-quality improvement. All five full candidate shots and the numerical human/mounted/growth diagnostic frames were inspected. The block geometry remains diagnostic, not accepted final art.

Independent code review found only the missing standard-suite registration; integration owns adding `raw-pose-palette` and replacing the old per-class scene name. A second review after manual-clock/failure revisions found no concrete defect in the owned raw files. No compatibility VAT reader remains.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `skinnedPipeline.test.ts` | Sparse LOD selected a matrix-animation row; nonloop endpoint retained. | Sparse LOD selects its rig palette slot; looping and nonloop explicit endpoints retain their final local sample; failed multi-rig upload suppresses submission until full recovery. | Canonical resolved playback replaces the old reader; partial uploads cannot produce mixed frames. **moved** |
| `rawPosePalette.test.ts` | No raw palette owner. | Snapshot identity reuse, fresh-allocation reupload, failure cleanup, checked limits and exact-once destruction. | New owned GPU lifetime has real growth/failure boundaries. **moved** |
| `vatLayout.test.ts` (removed) | Nonloops clamp; loop phase1 wraps to0 inside the reader. | Canonical/public-pipeline tests retain phase1; only an advancing preview clock wraps. | Delete the obsolete reader and keep authored endpoint interpretation in one resolver. **moved** |
| `per-class-animation` (renamed scene) | Independent/shared matrix clip tables and nonblank count>150000. | Authored durations1/2/1, two rig/animation owners, nonblank387297; original floor unchanged. | Local source data replaces matrix bakes. The separate actual raw oracle additionally catches data aliasing. **moved** |
| `raw-pose-palette` | No production raw local-pose oracle. | Ten actual visible/depth CPU comparisons, coverage, residency and resource checks. | Certifies the consumer, not just the shared kernel. **moved** |
| `soldier-materials` / `_raw-normal-limits` | CPU prepose and synthetic identity controls read/edit matrix samples. | Equivalent source-rig/local-animation controls; original numerical tolerances retained; five navigation-only baselines refreshed and scroll access checked. | Remove the old format without silently deleting normal/material coverage. **moved** |
| `renderer-capabilities` | Oversized storage check used VAT terminology. | Same storage-limit rejection, current name. | Naming-only cutover; no limit changes. **moved** |

No simulation, combat, unit-stat or golden-state change belongs to this pass.

## Integration decisions and limits

- **Fail closed after a partial upload** (sound, high confidence; parent-approved): if rig A queues successfully but rig B fails, the caller still receives the original error. Subsequent draw/compute calls submit no partial crowd until a whole upload succeeds. Keeping the old picture would require preserving old GPU generations and is not promised by the synchronous API.
- **The preview owns its clock** (sound, high confidence; parent-approved): a frozen request for phase1 displays the authored endpoint, even for a looping clip. A running preview wraps its progressing phase before submission. The raw renderer only resolves supplied playback; it no longer guesses clock behavior from override options.
- **Small initial storage with synchronous doubling** (sound, medium confidence): resources start small and grow to the needed capacity, bounded by actual device limits. Growth resets frozen-source residency and uploads active immutable sources once. This avoids maximum-roster reservation, but retained slack/temporary replacement peaks need07 measurement; it is not a performance conclusion.
- Raw dynamic capacity/high-water and snapshot upload bytes are reported. CPU packing/upload time, static rig bytes and compute GPU timing remain07 gaps. The existing raw GPU frame timer starts after precompute, so it is not a total palette-plus-render cost measurement.

The shared kernel, source bounds, loader admission, Three lifecycle/shadows and merged standing hardware gate remain their owning lanes' evidence. This report must not be used to mark all of06 complete.
