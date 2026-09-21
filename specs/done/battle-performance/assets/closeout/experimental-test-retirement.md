# Experimental test retirement

This records the test changes made when removing the retired renderer experiments. Production runtime behavior is unchanged. Test names containing a backend placeholder formerly executed once per experimental backend; retained tests now execute only against production TypeGPU. Source before this cleanup remains available in Git.

24 production suites (179 executable tests) moved into the ordinary web test runner. 17 lab-only suites and 18 web suites targeting deleted lab code were retired. Three lab-directory ownership checks and one lab-only timing-disable case were removed within retained suites.

## Preserved production checks

### crowdAudienceAdmission.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/crowdAudienceAdmission.test.ts` to `web/tests/battle-renderer/crowdAudienceAdmission.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| admitted diagnostics read this owner's captured pose, not the caller's array | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the admitted submission identifies a pose, not the uploads a moving camera causes | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| explicit seating verification re-samples the whole population, errors at its end included | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| nonfinite elevations and heights are rejected rather than passing an absolute compare | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| an unadmitted, refused, empty or released population reports nothing admitted | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| explicit mesh authoring keeps distant appearances drawable without allocating atlases | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### crowdSurfaceImages.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/crowdSurfaceImages.test.ts` to `web/tests/battle-renderer/crowdSurfaceImages.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| two appearances of one baked texture bind one image and keep their own tables | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| crowd disposal destroys each shared image exactly once | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### impostorDerivation.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/impostorDerivation.test.ts` to `web/tests/battle-renderer/impostorDerivation.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| equals the CPU packer across ${name} | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| picks a co-optimal tile on an exact bisector, never a third one | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| only an even grid folds cells onto exact duplicates | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the evaluated tile directions are the baked table, cell for cell | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a degenerate direction keeps the reference's tile 0 rather than an unseeded scan | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| carries one soldier in six floats and the whole camera in forty-eight bytes | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| writes the soldier's own camera-independent values at its own offset | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| carries the corpse fade and a missing elevation the way the packer reads them | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| carries the oracle's guarded half-field, zero included | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| declares the camera as one block and the soldier as six floats | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| specialises the grid it was built for rather than reading a table | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| keeps one owner of each step, whatever calls it | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| bakes this atlas's anchor and span instead of publishing them per frame | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the tile-difference classifier's direction is the one the packer picks its tile from | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### impostorStateOwnership.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/impostorStateOwnership.test.ts` to `web/tests/battle-renderer/impostorStateOwnership.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a camera move costs one bounded uniform write, whatever the population | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a submission costs six floats per soldier and nothing more | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| growth replaces the soldier buffer alone and leaves the view block in place | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| admission uploads the atlas once and leaves no error scope open | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the compiled vertex stage consumes soldier state, never a packed record | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the audience's camera refresh writes one view block per layer and no soldier bytes | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| no frame path builds or reads the record diagnostic | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a layer admitted without record diagnostics has no storage soldier buffer to read | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the diagnostic reads the soldier buffer growth installed, not the one it replaced | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a republication or a disposal during the readback fails instead of answering | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a disposal during the readback fails instead of answering | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the diagnostic stage compiles the same derivation the vertex stage does | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### posePaletteAdmission.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/posePaletteAdmission.test.ts` to `web/tests/battle-renderer/posePaletteAdmission.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| insufficient storage bindings reject before any palette allocation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| two frozen sources per soldier fit the output limit and retain sparse slots without repeated uploads | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| failed palette growth retains the admitted output and retries exact sources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| constructor allocation failure and impossible dispatch leave no scopes or extra resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### postAdmission.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/postAdmission.test.ts` to `web/tests/battle-renderer/postAdmission.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| every post allocation is realized before return and all late admission failures release the chain | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| asynchronous GPU admission errors reject post initialization and release all resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### soldierFactionTyped.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/soldierFactionTyped.test.ts` to `web/tests/battle-renderer/soldierFactionTyped.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| transpiles both typed bodies to WGSL | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| keeps one linearAlbedo owner behind factionAccent | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| carries the canonical faction palette into the shader body | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| evaluates the transfer function on both sides of the sRGB threshold | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| binds the impostor surface body to the typed factionAccent | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| binds the overlay fragment body to the typed linearAlbedo | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| reads the whole candidate surface | Scans the candidate directory and its retained raw color oracle. | Removed. | That directory and raw numerical-control surface no longer exist; typed numerical/shader tests remain. |
| routes every colour helper user through the typed module | Scans the candidate directory and its retained raw color oracle. | Removed. | That directory and raw numerical-control surface no longer exist; typed numerical/shader tests remain. |
| keeps the raw WGSL copy in the numerical control alone | Scans the candidate directory and its retained raw color oracle. | Removed. | That directory and raw numerical-control surface no longer exist; typed numerical/shader tests remain. |

### soldierImageOwnership.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/soldierImageOwnership.test.ts` to `web/tests/battle-renderer/soldierImageOwnership.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| appearances sharing loaded bytes bind one image even when their materials differ | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| images differing in color interpretation, mip policy, sampling or bytes stay separate | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| appearances missing a channel share one fallback image per channel | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| equal requests made while a creation is in flight share that one allocation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a failed decode retains nothing and leaves the owner able to retry | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a failed upload closes its bitmap, retains no image and is retried once | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal during a creation destroys the arriving image once and admits no more | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| repeated disposal destroys each owned image exactly once | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a replacement preparation allocates on its own device while the outgoing one stays valid | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### terrainAdmission.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/terrainAdmission.test.ts` to `web/tests/battle-renderer/terrainAdmission.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| asynchronous terrain resource errors reject the staged layer and release all resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### terrainSceneLifecycle.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/terrainSceneLifecycle.test.ts` to `web/tests/battle-renderer/terrainSceneLifecycle.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a failed staged generation retains the previous complete terrain and disposes staged resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal rejects pending terrain replacement and releases its late factory result | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| committed terrain content is read from the generation's own owners | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a staged generation in flight is reported as replacing the installed one | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| isolated model review keeps its ground while suppressing scenery and its shadow | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| terrain metadata follows the committed generation and returned descriptors cannot mutate it | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuFrameLifecycle.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuFrameLifecycle.test.ts` to `web/tests/battle-renderer/typegpuFrameLifecycle.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| resize stages complete attachments while preserving camera identity, and failure preserves the old frame | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal during pending resize releases both generations before resize settles | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| encode owns no submission and forwards post bypass separately from bloom | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| camera construction and asynchronous admission failure release the camera and attachments | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the depth attachment the pass clears is the shared battle policy at %ix | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| depth stats describe the attachment actually installed across resize, rollback and disposal | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuSceneLifecycle.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuSceneLifecycle.test.ts` to `web/tests/battle-renderer/typegpuSceneLifecycle.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| failed staged terrain replacement retains the previously prepared scene | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a dependent failure after terrain commit cannot present mixed generations | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal during an awaited UI upload prevents late readout allocation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| every update submits pose once; unchanged camera demand and repeat presentation submit none | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| pending crowd upload rejects overlapping updates and disposal prevents late pose submission | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a successful crowd replacement installs the staged generation and carries the admitted pose at the last prepared camera | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| an admitted empty crowd is carried into the replacement rather than dropped | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| ${label} admitted crowd survives a replacement before the first preparation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a failed crowd staging retains the last valid world and stages nothing | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a refused admission releases the staged crowd and keeps presenting the old one | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| GPU rejection of the carried-pose upload preserves the installed crowd | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal while staged crowd preparation waits releases the staged resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal while admission waits releases the staged crowd before it can install | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a crowd replacement cannot overlap another staged scene operation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| repeated replacement retires each generation and separates identical submissions by epoch | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| an unadmitted pose or an uncommitted terrain generation has no seating identity | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| seating verification measures only when asked, and refuses instead of passing vacuously | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a staged operation in flight refuses verification rather than measuring a pose it is replacing | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| preparation, presentation and stats never scan the admitted population | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| admitted pose and per-soldier reads come from the installed crowd owner | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| scene stats publish the environment, terrain and cue owners this world installed | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| ordinary battles allocate no block-debug layer and refuse its upload | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| attack arcs and the block-debug view own separate layers, blocks drawn first | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| disposal during an awaited block upload prevents late debug allocation | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| scene stats publish the frame's own depth attachment, re-read after a resize | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuShadowResources.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuShadowResources.test.ts` to `web/tests/battle-renderer/typegpuShadowResources.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| the typed receiver schema measures the shared block, record for record | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the fitted single map allocates one 1024 layer and High two 2048 layers | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| High is 32 MiB of depth before backend overhead | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| each active cascade gets its own clear-to-0 pass, layer and camera index | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the receiver binds one 2d-array view of the same depth array in both modes | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| every cascade camera buffer is written separately before a submission | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a failed allocation destroys what it already took and stays disposed | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the re-headed sampler carries the shared body verbatim onto typed resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuShadowScene.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuShadowScene.test.ts` to `web/tests/battle-renderer/typegpuShadowScene.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| High admits the crowd against one main view plus every cascade of the same frame | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| High encodes one caster pass per cascade, each with its own camera binding | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the fitted single map still encodes exactly one caster pass | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| off allocates no sun depth and submits no caster work | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| a reloaded terrain refits the same cascade resources rather than growing them | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuShadowShader.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuShadowShader.test.ts` to `web/tests/battle-renderer/typegpuShadowShader.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| both modes bind the cascade depth array and one typed receiver block | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| the fitted single map samples layer 0 directly and High blends both layers | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### typegpuShadowTypes.test.ts

Moved from `apps/battle-perf-lab/candidates/typegpu/tests/typegpuShadowTypes.test.ts` to `web/tests/battle-renderer/typegpuShadowTypes.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| the typed receiver block is the shared block, and a record is only part of it | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### canvasOwnership.test.ts

Moved from `apps/battle-perf-lab/src/live/tests/canvasOwnership.test.ts` to `web/tests/battle-renderer/canvasOwnership.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a cancelled queued replacement cannot let a third surface bypass the draining owner | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### picking.test.ts

Moved from `apps/battle-perf-lab/src/live/tests/picking.test.ts` to `web/tests/battle-renderer/picking.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| native CPU picking matches independent Octree over playable/apron triangles, including grazing and backface rays | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### crowdAudience.test.ts

Moved from `apps/battle-perf-lab/tests/crowdAudience.test.ts` to `web/tests/battle-renderer/crowdAudience.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| full catalog impostor groups are main-only while plural shadow views retain mesh casters | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| camera refresh cannot move or alter a committed corpse when caller reuses input objects | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| camera-only refresh preserves mesh and shadow history | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| failed upload cannot draw or advance history; growth and empty frames retain correct hysteresis | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| asynchronous upload retains the view and submitted data from admission | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| disposal preserves admitted input until the last asynchronous mesh read | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| pending upload rejects concurrency and disposal is completed before the owned promise rejects | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| simultaneous upload/cleanup errors preserve the upload error and release every owner | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| missing unused atlas rejects before allocation; later constructor failure cleans admitted owners | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| camera-only reproject selects new bodies from owned submission and skips equal views | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |

### crowdUploadOwnership.test.ts

Moved from `apps/battle-perf-lab/tests/crowdUploadOwnership.test.ts` to `web/tests/battle-renderer/crowdUploadOwnership.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| keeps pending pose slots owned until upload completes | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |
| releases failed uploads and does not revive after disposal | Runs for TypeGPU plus experimental backends. | Runs against TypeGPU only; ownership and failure assertions preserved. | Raw/vgpu implementations were deleted. |

### gpuTimestampRanges.test.ts

Moved from `apps/battle-perf-lab/tests/gpuTimestampRanges.test.ts` to `web/tests/battle-renderer/gpuTimestampRanges.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| unions unordered nested and overlapping ranges without mutating inputs | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| retains gaps only in span and merges touching ranges | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| subtracts exact nanoseconds at an epoch beyond Number precision | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| rejects empty, reset/reversed, negative data but allows quantized zero duration | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### nativeGpuAllocations.test.ts

Moved from `apps/battle-perf-lab/tests/nativeGpuAllocations.test.ts` to `web/tests/battle-renderer/nativeGpuAllocations.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| retains simultaneous growth peak through replacement and repeated disposal | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| distinguishes shrinking volumes from array layers and includes every mip and sample | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| marks current totals unavailable while unknown resources live and peak permanently unknown | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| preserves existing check APIs and restores public methods without destroying owned resources | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| does not count creation that throws | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

### nativeGpuTelemetry.test.ts

Moved from `apps/battle-perf-lab/tests/nativeGpuTelemetry.test.ts` to `web/tests/battle-renderer/nativeGpuTelemetry.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| multiple actual submissions correlate to final render, excluding asynchronous timing copy | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| unsubmitted work is never assigned the previous frame and its query slot is quarantined | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| full ring reports missing measurements without fencing or corrupting pending frames | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| another timestamp owner is preserved and unavailable measurements stay null | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| unsupported timing preserves real submission identity and returns no fabricated events | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| cancelled partially submitted presentation stays incomplete and releases safe slots | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| work encoded before measurement makes its receiving submission incomplete | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| failed originating validation cannot become a complete GPU timing | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| publishes ordered diagnostic pass details only when requested, without changing aggregate stages | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| aggregates overlapping stages from raw ranges without adding stage unions | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| withholds all interval aggregates when one query is invalid | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| an unsupported device is distinguished from supported timestamp queries | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| the window counts the draws its submitted buffers offered, and only those | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| draws are summed across every command buffer and every submit of one window | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| indirect draws count as one command each and are named separately | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a reused render bundle counts per submitted execution, never per creation | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a bundle this observer never recorded withholds the count instead of undercounting | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a repeat submission of one command buffer is not a second execution to count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a queue submit that fails at the call offered nothing | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| offered is not presented: validation failing later does not retract the count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| draws encoded outside the window that submits them are reported, not re-attributed | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a submitted buffer this observer never encoded withholds the count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| the observer's own timing resolve and copy submission stays out of the count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| supported and unsupported devices observe the identical draw count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a submission that carried no command buffer reports no measurement at all | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a cancelled window's draws never reach the next window's count | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| encoder retention is bounded, and only the unsubmitted account depends on it | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| disposal restores every patched entry point and counts nothing afterwards | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a device without render bundles is observed without pretending it has them | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| work submitted after its window closed is left behind, never counted as offered | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a defect in work the queue never received leaves the offered count intact | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a multi-draw command taking its count from a GPU buffer withholds the total | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| a draw the backend rejects is not counted as encoded | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| counting a bundle execution does not consume the caller's sequence | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| draws past the pass retention limit are counted even though their timing is not | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| pass records are the timing path's, and are not allocated without it | Production telemetry checks; some draw-only fixtures disabled timestamp queries via a lab option. | Production telemetry checks; draw-only fixtures use a device without timestamp-query support. | Lab timing-disable override was deleted; unsupported-device behavior remains. |
| the disabled lab control issues no query GPU work while actual submission identity advances | Verifies the experimental timing-disable override. | Removed. | The override was deleted; normal and unsupported-device timing are still tested. |

### sceneLifecycle.test.ts

Moved from `apps/battle-perf-lab/tests/sceneLifecycle.test.ts` to `web/tests/battle-renderer/sceneLifecycle.test.ts`.

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| pending operation excludes concurrency and closes before deferred cleanup | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| cleanup preserves the original operation rejection and still settles the owned promise | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |
| failed operations permit retry; completed operations retain their return value | Same production behavior, separately run from the lab. | Same assertion in the normal web suite. | The production owner remains; the lab is removed. |

## Existing production fixture labels

- `web/src/battle/gpuFrameTiming.test.ts`: fixture backend labels changed from raw to TypeGPU; submission matching, missing timing, and completion assertions remain the same.
- `web/src/battle/benchmark/benchmarkRecording.test.ts`: recorded renderer metadata now uses `backend: typegpu` instead of the removed `threeFrameId`; recording assertions otherwise remain the same.
- `web/src/battle/battleDebugApi.test.ts`: debug metadata fixtures now use `backend: typegpu` instead of the removed `threeFrameId`; debug API assertions otherwise remain the same.

## Retired experimental checks

Each check below exercised a deleted experimental owner. No production behavior was disabled to retire it.

### apps/battle-perf-lab/candidates/typegpu/tests/impostorRecordCheck.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| resolve to two entry points over one set of bindings | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| read the camera from the published block in one stage and per probe in the other | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| measures the readback stride the check reads records back at | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |

### apps/battle-perf-lab/candidates/typegpu/tests/shadowCascadeOverlap.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| the gate drives the genuine High fit, not a contrived receiver block | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| every probe's world point lands at the receiver depth it claims | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the hand-derived weights are what the shared fade produces | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the overlap band's two weights sum to exactly one | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the first cascade's near half is unfaded through the zero-width-margin guard | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the last cascade fades to unshadowed at the capped far | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| every weighted cascade is admitted by its own map and clear of every cleared depth | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| each configuration's expected shade is the complement of the weights it keeps | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| a layer swap moves every probe any cascade weights | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the corrupted receiver exchanges the two cascade records | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the tolerance is derived from the fit and cannot mask a wrong weight | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the receiver's shading normal is a sampling input, not an unused argument | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |
| the probe surface resolves to WGSL that samples both cascade layers | Checks the named experimental behavior. | Retired with its owner. | This suite validates the retired hardware-probe machinery and its fixtures. Production impostor derivation, shadow resource, scene, shader, and cascade-policy checks remain. |

### apps/battle-perf-lab/report/compareRuns.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| retains existing FPS definitions and exposes missing GPU timing and unequal sim progression | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects changed workload and contaminated evidence | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects forged summaries and skipped presentation boundaries | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a renderer-only held recording as live evidence even when both runs match | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects an early victory marked complete and an omitted phase | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| only declared shadow setting may vary within shadow-cost pair | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| uncollected hardware and contradictory backend are not inferred | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| malformed JSON cannot become eligible | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| CPU zeros remain measured and incomplete GPU submissions do not enter distributions | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| phase CPU distributions partition the run and follow the camera phase owner | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the boundary submission belongs to the opening phase and is counted once | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| phase spans and unions stay distinct from the double-counting pass sum | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| absent, partial and unresolved phase ranges stay missing instead of zero | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| corrupt simulated seconds are rejected using the simulation time owner | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| CLI writes rejected-pair evidence and preserves existing output | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| review regressions reject phase swaps, sequence gaps and post-terminal samples | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| an empty GPU snapshot reports unavailable timing and corrupt counters are rejected | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/src/live/tests/sceneBackend.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| vgpu submission remains synchronous before validation, and every owner is released even if surface cleanup fails | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/src/shadow-control/tests/heldWholeMapFit.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a camera that pans, zooms and orbits keeps the original whole-map map | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a new terrain rect refits the whole map to it, mid-trace | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a new sun re-poses the same map instead of freezing the old light | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the report answers out of the policy the build installed | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| every read is its own snapshot, taken when it is read | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the report answers for the policy the build is running now | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/heldBenchmarkAuthority.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| an unset held tick leaves the lab build's benchmark live | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| only the canonical contact ticks can be held | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a held build substitutes the authority only where the battle loop reads it | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a held build that never reaches the battle loop's import fails instead of shipping live | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/impostorControlRecords.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a packed backend is still held to exact equality, with no tolerance at all | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a derived backend passes on inexact records inside the declared bound and fails outside it | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a derived backend reports a co-optimal tile as a tie and a wrong tile as a fault | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a nonfinite derived record fails however small the gap looks | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/postTimingSummary.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| maps ordered passes to the pyramid and final output without combining samples | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| refuses partial, missing or wrong-count timings rather than inventing zeros | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/vgpuFrame.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| resize retains camera identity and same-size calls allocate no resources | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| post constructor rejection cleans staged frame and constructor camera | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| dispose during pending resize rejects concurrency and cleans both generations before settling | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| render routes before one combined sky/world pass and forwards post bypass | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a staged cleanup error cannot skip original frame resources or replace disposal failure | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/vgpuHorizonCaster.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| builds a position-only pass against the p/n/color horizon mesh | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| borrows the beauty mesh's buffers instead of re-uploading the horizon | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| destroys no horizon bytes of its own, in either disposal order | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| would reject the beauty mesh: vgpu binds every attribute to a vertex input by name | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/vgpuScene.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| crowd draws dispatch pose once each; camera-only prepare/render retain separate ordering | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| an in-flight upload blocks render and cleanup finishes before disposal rejection | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| staging failure keeps the scene recoverable; dependent failure after commit closes every owner | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| UI publication invalidates preparation and preserves source upload order | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/vgpuStorageOffset.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| a partial vgpu storage write preserves surrounding records | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/vgpuTerrainScene.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| staging failure retains old terrain and successful replacement releases the previous generation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| dispose while new terrain admission awaits releases late and prior owners before promise settles | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/tests/wholeMapShadowControl.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| an ordinary lab build installs nothing | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| without the control the shared policy still spends its map on the camera | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a shared policy that no longer means the original fails the build | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the substituted site must exist exactly once, or the build fails | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a real Vite build carries the substitution, or fails | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/trials/checkpointObserver.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| every sample the real pump produces pairs stats with their own completed frame | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a poll during preparation sees the very mismatch the boundary excludes | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| nested and competing registrations during preparation take no sample | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the synchronous pump path holds the same boundary | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a sample keeps the values it saw when the owner mutates the same storage | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a stopped pump leaves its checkpoints missing, with how near it got | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the closest completed frame inside the window wins the checkpoint | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| an observer fault never throws into the page's own scheduling | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a frame that completes with no registration between is a recorded fault | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the installer survives serialisation with no module scope around it | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the lab field map reads the real crowd audience owner's own stats | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| the source field map reads the equivalent numbers from the other spelling | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| an absent count is an error, never a zero | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a visible histogram that does not break down mainVisible is refused | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| equivalent counts compare and one-sided fields stay scoped | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a disagreeing count is reported as unequal, not hidden | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a missing sample and a stat camera that contradicts the report both fail | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| only the sampled frames' report rows are archived | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a missing Menu frame cannot pass camera verification | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a page that could not be read is a failure with its reason, not an observation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| provenance and scene failures fail the run before any checkpoint reasoning | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a live build is refused, and a sample whose authority moved is refused | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/trials/provenance.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| digests a recorded file list the way the fixed-build generator does | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| streams a file and refuses one that is not the recorded length | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| refuses a recorded size that is not a byte count instead of reading unbounded | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| stops at the remaining budget and still charges what it read | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| charges a refused read to the budget so oversized entries cannot read forever | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| accepts a build whose artifacts, shared assets and served bytes all match | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects served bundles that are not the emitted artifacts behind a matching index | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects an emitted artifact the server does not have at all | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| charges an error body it had to drain, so misses cannot read off budget | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| bounds every served read to the recorded size and never fetches the shared assets | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| refuses a served body longer than the artifact it claims to be | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| will not let a local shared digest speak for a tree the build does not reach | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| verifies a shared subtree linked inside a directory of emitted artifacts | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a shared subtree the build linked to a tree other than the hashed one | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| names a manifest field the producer left out rather than failing on a path argument | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a shared asset that changed since the build was recorded | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a server that is not hosting this backend's fixed build | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a server that dropped cross-origin isolation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a manifest whose own recorded digest does not describe its file list | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| refuses a declaration that carries no settings to check the recording against | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| reports the render configuration declaration as missing rather than inventing a digest | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### apps/battle-perf-lab/trials/trial.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| unmutes audio through the real graphics-settings storage key and changes nothing else | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| archives a complete trial with matched provenance and a quiet host | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a provenance mismatch before any browser work and keeps the evidence | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| preserves the export and scenario failures of a failed run | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| never accepts a scene that exited nonzero, however good its evidence looks | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| requires the scene's own report and its checks, not just an empty failure list | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a recording whose settings are not the declared render configuration | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| records a thrown browser seam instead of losing the trial | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| never reuses a directory that already holds a trial | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| separates a functional run from a quiet-rankable one | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| opens the measured window at the benchmark, not before the provenance sweep | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| records shared system load without charging or crediting it to the trial | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| keeps a quiet shared process in the record without blocking the ranking | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| stops sampling as soon as the run settles instead of waiting out the interval | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| samples the host while the benchmark is running, not only at its ends | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| records an unusable Menu export instead of archiving a previous trial's bytes | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| treats an unreadable process listing as unavailable, not as an idle machine | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| will not call a host quiet from a single snapshot | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| will not call a window it never watched quiet | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| requires the series to open and close around the run, in order | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| does not credit a sampled interval that never carried a timestamp | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| requires every input a comparable trial needs | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a recording that stayed muted or presented another backend | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| labels a held recording renderer-only whatever kind it claims | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| requires the source build to present without a native backend label | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeReplayConfig.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| publication alias selects only the native field importer and cannot recurse into its provider | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeShadowResources.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| the fitted single map allocates one 1024 layer and High two 2048 layers | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| High is 32 MiB of depth before backend overhead | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| each active cascade gets its own clear-to-0 pass, layer and camera index | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| every cascade camera buffer is written separately before a submission | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a failed allocation destroys what it already took and stays disposed | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| the single receiver shader never names a second cascade or a second layer | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| the High receiver shader reads the shared view row and near plane, and both cascades | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| both world shadow shaders bind the cascade array and one receiver block | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/battleGrassPublications.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| publication replay preserves a pending ring until the recorded publication, without running its sampler | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| grass record chunks preserve exact bytes without embedding a large revision in frame JSON | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| a publication step is chunked as its own ranges, not as the whole field again | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeReplayControl.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| preserves every draw upload and render boundary, including camera-aware settle | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| retains uploads across frames and refreshes changed camera without another crowd upload | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| missing publication boundary fails closed and cannot resume a partially executed batch | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| settle before first camera drains without inventing a presentation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| unused source publications are rejected rather than silently discarded | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| awaits asynchronous crowd upload before a later upload or presentation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| snapshots only the final actual submission before asynchronous validation completes | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/spoolPacket.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| packet decoding preserves typed command arrays and verifies a shared binary resource before publishing it | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| changed resource bytes fail before replacing a published reference | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| verified resource cannot overrun its declared record byte range | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeFrameLifecycle.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| same-size resize preserves camera/attachments and compiles nothing | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| resize commits a complete replacement and retains camera identity | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| every partial post constructor allocation is released | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| late allocation failure retains the old complete frame and permits retry | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| GPU admission failure retains old attachments and frees rejected resources | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| pending resize rejects concurrent requests and cannot publish after disposal | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| frame construction releases camera and attachments when nested post allocation fails | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| resize republishes the latest camera/grade at the new physical size | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| depth diagnostics report the attachment the frame actually allocated | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| the encoded pass clears depth with the value the diagnostics publish | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/crowdAudience.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| far main soldiers remain actual impostors while their shadow stays a mesh | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| history survives buffer growth but removed soldiers do not inherit stale history | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| rejects missing zero-count catalog atlases before allocating and disposes idempotently | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| multiple shadow views form a union independent of main visibility | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| failed later atlas construction disposes earlier resources and mesh | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| failed uploads prevent stale draws and preserve preceding successful LOD history | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| camera-only refresh retains selected impostor groups and never advances mesh/LOD history | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| published histograms count actual main and shadow audiences without counting culled soldiers | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| crowd upload and reproject do not repeat an identical billboard refresh | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| billboard refresh compares copied camera values rather than caller identity | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| failed billboard refresh cannot make the preceding camera drawable | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| soldier diagnostics report the pose this owner admitted, not a caller's array | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| reprojection republishes one admitted pose while a new submission reads as new | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a rejected upload reports no admitted pose rather than the refused one | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| admitted poses name the distinct appearance and clip pairs being presented | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| admitted diagnostics keep reading the captured pose after the caller mutates it | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| explicit seating verification re-samples the whole population, errors at its end included | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| seating verification keeps the source tolerance at its exact boundary | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| nonfinite elevations and heights are rejected rather than passing an absolute compare | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| an unadmitted, empty or released population reports nothing measured, never a match | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| the admitted submission identifies a pose, not the uploads a moving camera causes | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/battleSpoolWorkerQueue.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| worker drains already-delivered packets in order without another main-thread message | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| worker failure drops queued writes and ignores later deliveries | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/impostorTransport.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| round trips all byte values across multiple chunks without changing pixels | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/sourceTimestampTap.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| adds only the CPU range callback to the exact pinned WebGPU readback, preserving all GPU calls and WebGL source | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| rejects a changed pinned bundle instead of silently instrumenting a different implementation | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeShadowScene.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| High admits the crowd against one main view plus every cascade of the same frame | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| High encodes one caster pass per cascade, each with its own camera binding | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| the fitted single map still encodes exactly one caster pass | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| off allocates no sun depth and submits no caster work | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| scene stats report the shadow resources actually allocated | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/battleReplayArchive.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| archive encoding preserves typed-array bytes and detaches live source storage | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| capture stops at its byte cap without retaining the overflowing frame | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| asset encoding is stable across property insertion order and rejects opaque objects | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| long numeric pose arrays preserve double precision and nonfinite values compactly | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| immutable frozen poses are stored once across soldiers and frames within the total cap | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| overflowing pose definitions do not consume the static-inclusive window budget | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| archive rejects executable values instead of silently dropping them | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/rawGrassField.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| grass publication revisions upload once and keep both pipelines alive across camera history | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a travelling native consumer uploads bounded ranges, never the whole focus buffer again | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| edits published during capacity admission reach the GPU on the next prepare | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| prepared visibility diagnostics report what route and draw actually obey | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/nativeSceneLifecycle.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| failed staged terrain replacement retains the previously prepared scene | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a dependent failure after terrain commit cannot present mixed generations | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| disposal during an awaited UI upload prevents late readout allocation | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| ordinary battles allocate no block-debug layer | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| attack arcs and the block-debug view own separate layers, blocks encoded first | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| GPU rejection after carried-pose upload preserves the installed crowd | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| an admitted empty crowd survives replacement and render-only preparation | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a successful crowd replacement installs staged resources and carries the admitted pose | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a failed crowd staging retains the last valid world and stages nothing | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a refused admission releases the staged crowd and keeps presenting the old one | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| disposal while staged crowd preparation waits releases the staged resources | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| disposal while admission waits releases the staged crowd before it can install | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a crowd replacement cannot overlap another staged scene operation | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| scene stats publish each owner's installed content and the PREPARED pose | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| an ordinary battle publishes no block-debug layer content | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| an explicit inspection measures the admitted pose against the seating sampler itself | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| an unadmitted, empty or uninstalled world is unavailable rather than a vacuous match | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a staged operation in flight suspends verification instead of answering mid-replacement | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a crowd replacement advances the epoch that a restarted submission counter cannot | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/battlePresentationSpool.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| rejects duplicate window names before recording so a requested window cannot wait forever | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| retains a presentation until the disk worker acknowledges its compressed write | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| admits a bounded burst while reserving only one worker compression output | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/rawGrassRecords.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| native grass keeps pipelines stable across grow, shrink, empty and failed record admission | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

### web/tests/battleReplayFixture.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| the replay consumes a bounded prefix and closes the source without reading ahead | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| invalid frame limits fail before touching the source | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| source delivery waits for observation and failures close the source | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |
| an exhausted recording reports source completion separately from the frame cap | Checks the named experimental behavior. | Retired with its owner. | The replay, comparison, capture, or experimental-control machinery under test was deleted. |

### web/tests/nativeTerrainSceneStats.test.ts

| Test | Previous behavior | Final behavior | Why |
|---|---|---|---|
| published content is the committed generation's own | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a failed replacement keeps reporting the generation still installed | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |
| a disposed scene reports no installed terrain rather than an empty map | Checks the named experimental behavior. | Retired with its owner. | The alternate raw/vgpu renderer was deleted; current TypeGPU ownership checks are retained. |

