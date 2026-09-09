# Geometric roughness follows the posed normal

Actual shader capture identified a production input mismatch: our custom
`normalNode` shaded with the posed/facing normal, but Three's separate
`normalViewGeometry` still consumed the original normal attribute. Its screen
derivatives add geometric roughness to the authored material. A CPU-preposed
reference therefore had different roughness even when its palette was correct.

The existing position node now assigns its existing posed/facing normal to
Three's native `normalLocal` hook before returning the unchanged position.
Native Three skinning uses the same hook. No roughness feature is disabled;
there is no new buffer, material override, controller or source-art change.

## Causal controls

The archived [before report](posed-geometric-normal/before/report.json) and
[after report](posed-geometric-normal/after/report.json) own the measurements.
Each report's folder retains its ON/OFF live (`gpu`) and CPU-preposed
(`readback`) full PNGs, so both comparisons can be recomputed without scratch
outputs. “Baseline created” in these reports refers to isolated probe snapshots,
not changes to committed acceptance baselines.

At authored archer appearance 4, replay tick 0, frozen production camera/time:

| Shader | Normal-map use | Live/reference differing pixels | Max channel error |
| --- | --- | ---: | ---: |
| Original | On | 825 | 4 |
| Original | Off | 808 | 4 |
| Corrected | On | 0 | 0 |
| Corrected | Off | 0 | 0 |

The OFF control changes only material-use flags, retaining the normal image and
shader structure. All four corrected captures repeated exactly through snapCheck;
main/shadow tiers and corpse state matched, independent matrix error was
2.384185791015625e-7, and no page errors occurred. Corrected WGSL assigns the posed
normal before emitting `v_normalViewGeometry`; the roughness derivative term remains.
GPU probe 61253 exited 0 and closed its browser. The existing ≤1-channel raster
gate is unchanged; full replay verification remains with the parent integration.

The captured [original vertex shader](posed-geometric-normal/before/off.vertex.wgsl)
and [fragment shader](posed-geometric-normal/before/off.fragment.wgsl) came from
the original OFF float-target diagnostic; an original ON shader was not saved.
The corrected [vertex shader](posed-geometric-normal/after/off.vertex.wgsl) and
[fragment shader](posed-geometric-normal/after/off.fragment.wgsl) came from the
successful OFF raster probe; that folder also retains the corrected ON shaders.
These are complete emitted shader artifacts, not reconstructed excerpts.

Earlier raw-direction reference arithmetic was insufficient: all 18 failing
maxima persisted. A subsequent float-target scratch probe stopped on its own
incorrect row-padding assertion, not a production error. Before stopping it
verified that all 210,444 uploaded vertex floats and instance buffers matched
their CPU inputs; its captured WGSL exposed this roughness mismatch. That failed
probe is not claimed as float-position equivalence evidence.

## Review and scope

Ten focused CPU files passed 58 tests; web TypeScript check exited 0. Independent
code review confirmed native-hook ordering, posed coordinates and unchanged
shadow positions. Fresh neutral A/B image review found unchanged pose, equipment
and framing, with no new conspicuous holes/spikes/displacement. Existing pixel
edges and dark elbow/sleeve patch remain accepted art limitations. The implementer
also inspected every corrected full image.

The [independent review record](posed-geometric-normal/reviews.md) preserves both
verdicts and their scope. Its neutral visual review used the original and corrected
ON live images plus this [enlarged torso comparison](posed-geometric-normal/ab-crop.png)
(original left, corrected right).

This uses the existing browser parity failure as the regression: no private
material factory or fake graph API was exported just for a CPU test. Production
roughness now describes the same deformed surface as shading. No baseline image
was updated or removed in this commit.
