# Native scene composition checkpoint

The native owner now composes the prepared component resources into one scene, with distinct crowd updates, UI uploads, camera/grass preparation and final passes. Source draw commands retain their own pose work; render-only commands refresh billboard camera state without advancing crowd history. The coordinator (historical path: `../../../../../../apps/battle-perf-lab/src/raw/battleScene.ts`) owns resource teardown; the caller owns device, canvas and its GPU-error boundary.

[Initial controls](initial/README.md) and the [ordinary-position controls](ordinary-position/README.md) preserve cold and settled evidence separately. The latter draws all twenty appearances and all 15,560 L3 instances in its far diagnostic. Audiences and cleanup pass, while exact pixel identity and complete live-scene admission remain open. Static review does not prove absence of motion stutter.

The camera differential compares actual source projection/billboard bases, and the larger [captured-camera diagnostic](../../02-preflight/scene-camera/README.md) records zero audience differences over sampled real content. Synthetic clipping-boundary differences remain documented rather than silently changing projection policy.

New lifecycle coverage verifies observable failure behavior:

| Test | Previously uncovered behavior | Required result |
| --- | --- | --- |
| Staged terrain failure | Replacement allocation can fail before publication | Keep the previously prepared frame usable |
| Dependent terrain failure | Grass/shadow update can fail after terrain commits | Dispose the scene; never present mixed generations |
| Pending UI disposal | An awaited standard upload can finish after disposal | Reject completion before any late readout allocation |

The first two assertions fail in the preserved [negative control](lifecycle-negative.txt) and pass with the recovery/termination boundary. Existing gates were not weakened or repinned. Constructor/resource and resize details remain in the component lifecycle controls; integrated lifecycle variants and exact replay are the next admission work.

Independent static review identified initialization-order/capture-boundary risks, and the control now starts source terrain only after both runtimes allocate resources, captures image and stats together, and mirrors settlement/capture presentations. Initial sampling is still live, so cold images are diagnostic rather than exact recorded-publication comparisons. Fresh image reviews and their neutral A/B mapping are retained beside each run.
