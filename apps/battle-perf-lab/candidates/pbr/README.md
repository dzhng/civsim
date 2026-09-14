# Opaque standard-material numerical control

The shared [lighting function](../../src/shaders/standardPbr.ts) follows the pinned
Three 0.185.1 `MeshStandardNodeMaterial` and `PhysicalLightingModel`: Lambert
reflection, GGX/Smith-correlated visibility, Schlick Fresnel, direct multiscattering,
and separate dielectric/metallic IBL multiscattering. The exact
[DFG texture bytes](../../src/shaders/dfgLut.ts) come from Three's `DFGLUT.js`;
substituting the older analytic DFG approximation changes this renderer's model.
The adapted algorithms and data retain the [Three MIT license](../../src/shared/LICENSE.three).

The material function consumes linear base/emissive color, roughness, metalness,
AO, unit world normal/view/light directions, directional radiance, shadow
attenuation, PMREM and environment intensity. Exposure is absent because the post
chain owns it. Maps, tangent-space normal conversion, and face orientation are
resolved before calling; fog and post follow. Shadow attenuation scales the sun
only; this function does not implement shadow maps. The PMREM input is the current
renderer-generated CubeUV atlas, whose sampling requires Three `PMREMNode`'s Y
flip. The world remains z-up. Environment rotation and additional lights or
physical-material extensions are outside this pass.

Geometry roughness is an explicit caller input: the maximum component of the
maximum absolute screen-space x/y derivatives of the normalized, interpolated
**view-space geometric normal**, before a normal map. The function applies Three's
roughness floor, adds that term, and caps the result. The numerical control uses
constant planar normals, so it verifies a zero geometry term; varying-geometry
derivative integration remains a caller-level gate.

The [control](check.ts) renders the actual Three material and the shared WGSL
against identical bytes from the actual Three PMREM atlas. It covers dielectric,
metallic and mixed materials, AO, emissive contribution, roughness and camera
orientation under separate sun/IBL and combined lighting. It advances a real RAF
between cases: Three's analytic-light uniforms update by frame, so many manual
renders in one frame can otherwise compare against stale light intensities.
The [recorded numerical arrays](evidence/pbr.json) agree to a half-float step,
without warnings or nonfinite outputs. This establishes the bounded lighting
function, not full scene appearance or renderer performance.

Start `bun run --cwd web vite --config vite.pbrcheck.config.ts --host 127.0.0.1
--port 5197`, then obtain the coordinated GPU slot before running
`node apps/battle-perf-lab/candidates/pbr/verify.mjs`.
