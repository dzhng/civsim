# Combined hand integration — candidate checkpoint

The closure study is composed with the current heavy equipment, not the isolated
author's older gear. Its shared export keeps native forward correct and leaves
editable source coordinates unchanged. Anatomy, equipment, budget and motion
acceptance remain open.

## Preserve construction, not merely the recipe

Re-running the whole equipment recipe after a hand-only change moved unrelated
cloth, mail and helmet vertices. Independent comparison against `af53322d`
measured maximum nearest-point changes of 2.20, 6.22 and 1.16 mm respectively.
The cause may be nearest-surface fitting sensitivity to a different body mesh
search structure; that explanation is an inference, not a proven root cause.

That refit was rejected. The retained editable heavy assembly supplies its
original equipment and rig, while its anatomy source object is replaced with
the revised surfaced body. Export copies are joined through the existing
exporter. The saved `.blend` is the authoritative assembled source; re-running
the procedural equipment recipe is a new refit, not an equivalent re-export.

[Independent checks](integrated/controls.json) confirm exact equipment positions, normals, UVs, bone
indices, weights and triangle indices, and exact rig/bind/action data. Eleven
tangent scalars across cloth/leather/bronze differ by at most 0.0001000166; do not
describe the complete buffers as byte-identical. Outside the hands, 10,796
unique skin positions and their weights remain exact. The frozen heavy-motion
study is untouched. Incidental regenerated mail-source binary churn was restored.

## Production review

The focused capture uses the existing production workbench and unchanged
Bundled Chromium/SwiftShader configuration:

```sh
SNAP='power-grip,sword-grip,shield-grip,heavy-kit/close,heavy-kit/gameplay-pitch,heavy-kit/ready' VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs human-anatomy heavy-kit
```

The [final retained-gear run](integrated/capture.json) records 36 newly rendered, byte-stable tiles and no page
errors. Five comparisons fail against the unaccepted full-refit captures; those
failures are expected differences, not waived acceptance gates. No baselines
are blessed by this checkpoint. The forward test, human/heavy strict bakes,
full bake suite and TypeScript check pass. Material names also remain unchanged
after retaining the original skin material datablock. [Source hashes](integrated/hashes.json)
identify the composed assets.

Matched comparisons use the committed forward-candidate evidence, not recovered
older sheets that predate the export correction. The empty-hand sheet changes
125,641 pixels; the retained-gear ready sheet changes 3,316 pixels
([pixel counts](integrated/pixels.json)). These show
the change reaches the production route, not that anatomy is finished.

Direct inspection and fresh critique prefer the closer grasp: the opposing
thumb closes over the fingers and equipment sits inside an identifiable grip.
Remaining defects are repeated tubular finger curves, a broad flat palm, an
overlong-looking bar-like thumb and crowded angular transitions. The whole
soldier's proportions remain readable at review scale. Hand-contact visibility
is limited by the shield in two bearings. No new motion acceptance is inferred
from these static poses.

The fresh review's final-output follow-up inspected the corrected
[ready](integrated/ready.png), [sword](integrated/sword-grip.png) and
[shield](integrated/shield-grip.png) sheets and retained the same verdict with no
new visible defects. [Empty hand](integrated/empty-hand.png),
[close](integrated/close.png) and [gameplay pitch](integrated/gameplay-pitch.png)
retain the inspection context. The independent code review caught the rejected
equipment drift; the local CLI reviewer remains unavailable because its
configured model requires a newer CLI. That is not recorded as a passed review.

The whole-soldier and sword-grip sheets were opened together in Preview for an
approximately five-minute non-blocking checkpoint. No response arrived. The
provisional decision retains improved closure while keeping all listed anatomy
defects open; silence is not approval. Only these two owned documents were closed.
