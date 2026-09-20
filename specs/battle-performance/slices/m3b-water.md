# M3b — water

Depends on M2 and M3a. Selected backend: raw WebGPU.

The promoted water module owns GPU drawing while existing battleWaterGeometry and wave/shore policies own its inputs. Retain terrain-aligned height, translucency/depth behavior and environment-driven color.

Reuse water and complete-scene controls at the raised shoreline/horizon, with fixed wave time. Check no changed surface placement or transparency ordering. Inspect matched water crops and update/disposal behavior; no new port if inherited controls pass.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

[Focused current controls](../assets/migration-component-review/README.md): lake
passes; ocean remains numerically red at1x. The retained complete-scene fixture
has no water and cannot close this obligation.

The [ocean localization evidence](../assets/m3b-ocean-localization/README.md)
records the still-red beauty control and bounded diagnostic variants. Passing
roughness/normal diagnostics are not production fixes. Matching the source
projector and position invariance jointly passes all six diagnostic beauty cases;
either alone fails. Decide the durable comparison contract without replacing the
original end-to-end evidence or adopting scratch shader interception.

Next bounded implementation: add a lab-only aligned component comparison using
the existing source material and a per-reference canonical projector. Keep the
original default gate and aggregate failures intact; expose aligned results
separately. Scope any typed builder extension to the owned reference renderer
and marked material, with cache isolation and generated-WGSL verification. Verify
actual displaced geometry, multiple-camera isolation, a shading mutation that
fails, lake behavior and disposal. No production camera/global uniform/factory
option or native shader change belongs in this pass. See the independent-review
disposition in the localization evidence before implementing.

Current candidate verification lives in [aligned water evidence](../assets/m3b-aligned-water/README.md).
The aligned lab comparison is implemented on the candidate branch, with a
fog-free coordinate probe and successful flattening/shading falsifiers. Ocean1x
and lake1x/4x pass; ocean4x remains red. Next localize that multisample image
residual; do not reimplement the comparison or claim this slice exited.
