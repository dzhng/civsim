# Select raw WebGPU for the battle cutover

Raw WebGPU is the selected implementation direction. It uses the existing
renderer-core GPU runtime and shared game policies, with no new shader-authoring
library. The decision follows the declared raw/TypeGPU performance tie and favors
the smaller external API/build dependency surface. It is not a claim that the
current raw candidate meets live60fps, simulation30Hz, or the net-shadow contract.

The compared versions were Three0.185.1, TypeGPU0.12.5 and vgpu0.5.0; the held
browser reports record Chrome153 and the Apple Metal adapter at1440×900CSS/DPR2.
The physical framebuffer is2880×1800. Preserve that workload and quality.

## Evidence and its limits

[Three declared orders and the bounded confirmations](assets/02-held-rounds/README.md)
are complete. Across the three orders, raw's average and1%low ranges exceed
Three's at both held states; vgpu has lower cadence. Raw versus TypeGPU reverses
ordering in the later query-disabled confirmation, so the declared rule yields
a tie. Every quiet-host verdict failed. These are conditional engineering inputs,
not release timing, statistical confidence intervals or live battle acceptance.

[Eight coherent checkpoint runs](assets/02-held-authority/checkpoints/README.md)
also complete. Raw and TypeGPU match all observed counts/histograms at all twelve
checkpoints. All backends retain equal soldier and main/shadow visibility counts.
The source/vgpu comparisons retain an88-caster shadow-tier difference at early
checkpoints, and vgpu has a two-body visible-tier difference at one later-state
checkpoint. Thus not every historical candidate did exactly equal geometric work.
Approximate camera matching and these explicit differences must survive the report.
The shared LOD policy defects have since been corrected; those changes do not
retroactively make old timing runs equivalent.

Prior complete-scene, pose and material controls established no obvious one-sided
scene loss in independent still review. Strict pixel differences and shared noisy
contact overlays remain documented. Held authority, sampled images and component
floors cannot establish continuous motion or the final live workload.

## Why raw under the tie

- Raw directly owns resources/encoding and reuses the existing raw pose palette.
  This is reuse of one proven component, not proof the whole candidate is ready.
- TypeGPU adds its transform and uses explicitly unstable command encoders in
  frame, terrain, image upload and PMREM paths. Its typed authoring is useful,
  but the completed experiment did not establish a performance win paying that
  additional maintained surface.
- vgpu adds runtime resource-destruction methods absent from its published types
  and did not match the leading candidates' cadence in the recorded orders.
- Three remains a valuable reference and offline-authoring dependency. Its battle
  path has private allocation/renderer access and worse held-frame tails here.
  Keeping it because it is incumbent would not follow the completed evidence.

Do not merge battle's HDR frame and campaign's canvas frame merely because both
own attachments. They serve different world/pass contracts. Keep one frame owner
per world and shared camera, reverse-Z, pose and environment contracts. Verify the
actual emitted runtime graph before moving or deleting any Three dependency.

## Final owners and next playable checkpoint

`packages/battle-renderer/src/` will own the existing selected raw world, GPU
resources and shaders, moved rather than duplicated. `web/src/battle/renderer.ts`
will own the frontend presentation/lifetime boundary. Its API must be explicit,
independent of the old class. Shared asset, camera, terrain, environment and grass
policies remain in their current domain packages. There is no production backend
selector, old-engine fallback or saved-battle migration.

The concrete graph is in [migration.md](migration.md). Start with the independent
contracts pass, then promote the existing complete world. The first playable
checkpoint remains the real Menu benchmark through the selected lab route using
those final owners; production stays complete until cutover. This is not a new
port of terrain, water, crowd or post that already exists and has controls.

Before cutover, preserve user-visible High shadows (two2048 cascades), production
atlas publication and atomic asset reload, block-debug selection verification,
error/disposal behavior and honest resource accounting. The native facade
currently rejects three of these and returns no source-style memory count.
Those are real work items, not features to drop silently.

After selection, further work targets measured remaining costs and camera quality.
The simulation still misses its later-state throughput budget; its independently
reviewed combined candidate is being measured separately. Default shadow
readability, moving-shadow quality, the original/optimized-equivalent/final A/B/C
budget, live input latency and the unchanged30k floor all remain required.
