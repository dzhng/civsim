# CPU scene-camera differential

The native coordinator consumes Float32 camera matrices; production crowd culling consumes Three's CPU matrices. This check tests whether that precision difference changes actual sampled audiences before proposing a math replacement.

The fixed population is 15,560 presented soldiers from corrected-tour packet 354: recorded positions, facings, appearance IDs and alive state, seated through the recorded terrain height sampler. No pose dictionaries, textures or GPU resources are decoded. The camera set contains 301 canonical tour samples plus 70 recorded achieved window cameras. Source and native retain independent main/shadow LOD histories. Source shadow views come from the actual single-map shadow owner.

**5,772,760 actual-population comparisons produced zero visibility, main-level or shadow-level differences.** This does not cover every pose or every simulation frame of the tour.

The 289,380 additional synthetic probes intentionally straddle frustum and LOD boundaries using all 20 appearance bounds. They produce 40,450 visibility and 35,546 main-level differences, including 12,813 level differences while both views remain visible. Some probes are airborne or near the distant finite far plane. These demonstrate finite-precision boundaries, not an observed battle rendering defect. No projection correction or gate waiver follows.

[The report](report.json) retains every camera input in comparison order, appearance bounds, bounded differing examples, probe offsets/counts, and SHA256/byte identities for the recorded packet, terrain/static input archive and achieved-camera findings. It also records the exact `sceneCamera.ts` SHA256, because that helper was uncommitted during this run. Large source inputs and root implementation files are deliberately excluded.

Reconstruction uses `applyCamera3d`/Three Frustum and `projectionFootprint` for source, `battleSceneCamera`/`reverseZFrustumPlanes` for native, and `planCrowdLods` for both. Feed `cameraInputs` in order and the source packet described by the report; synthetic groups reset history. The local reporting diagnostic and helper snapshot remain under ignored `throwaway/crowd-camera-diagnostic` in the fixture worktree. Its passing Vitest invocation indicates completion, not a pixel-parity gate. No GPU or performance measurements were made.
