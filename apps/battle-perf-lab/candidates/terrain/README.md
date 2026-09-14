# Playable terrain and opaque horizon controls

This component submits the production ground and horizon vertex/index arrays
through native WebGPU, TypeGPU or vgpu. Their shared pure WGSL material uses the shared turf/water policy,
RG8 signed earth distances, canopy noise, terrain slope response, and on-field
water. The original on-field water applies a linear transfer inside its surface
function and again after mixing with turf; this port preserves both conversions.

The camera belongs to `renderer-core`; the environment owns sun, PMREM/DFG and
atmospheric lighting. The terrain owns only geometry buffers, the earth-distance
texture and a small state uniform. It renders into borrowed HDR/depth attachments,
with reverse-Z depth and the same front-facing winding as production. The vertex stage normalizes the view-space geometry normal; its interpolated
value supplies fragment derivatives before PBR evaluation, matching Three staging.
Its scalar shadow input attenuates the sun; shadow-map construction and spatial
shadow sampling remain separate work.

This is a base scene component, not a complete environment or benchmark backend.
Background quads, vista terrain, ocean/lake planes, grass blades, scenery and
shadow-map generation are excluded. The on-field water patch is included. The
horizon layout can contain ocean-plane specifications; this component deliberately
submits only its opaque mesh, so its caller still must render those ocean planes.

[The control](check.ts) renders actual production Three ground/horizon materials,
first as albedo/roughness and then with the real sun, PMREM and aerial perspective.
It compares HDR arrays before post, across all presets, three camera poses, and
with/without horizon. Shared geometry includes mud/road feathers, scree, rock,
water and varying slopes. The odd framebuffer exercises padded readback. The
[recorded acceptance results](../../../../specs/battle-performance/assets/02-raw/terrain/terrain.json) retain strict failures rather
than masking coplanar pixels. Material and beauty absolute diagnostic limits are
0.001 and 0.005 respectively; exact coverage and finite output are mandatory.
The recorded ground gate passes (material maximum 0.0007324; beauty maximum
0.0046387), while the full horizon gate remains red. Nine pixels in the grazing
view select the alternate wall-bottom face under every preset. Every recorded
large error includes a ray/triangle localization to the two source caps and their
authored colors; no pixel-count exemption is applied. Coverage matches exactly.
These diagnostic limits grant no permission to replace material detail or lower
quality.

The [separate projection diagnostic](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-canonical.json) is invoked
with `?canonical`: it changes only the reference's vertex projection to the
canonical combined matrix. It cannot replace the actual-production acceptance
control. The horizon wall has overlapping base/body bottom and end caps at
effectively the same Z or Y plane, with different colors; tiny projection/compilation differences can choose
different fragments at that authored coplanar overlap. The historical native control uses invariant clip output; `?invariant=0` selects
ordinary output. TypeGPU uses ordinary output because this pass has no equal-depth
prepass reuse. This choice is explicit in each report. Geometry and depth bias remain
unchanged.

The larger [readable-horizon control](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-visual.json), selected with
`?visual`, uses 1025×769 pixels. Its strict gates also remain red: 67 pixels select
the other source wall cap, plus two material-detail pixels exceed 0.001 and one
beauty-detail pixel exceeds 0.005. The largest unlocalized difference is 0.0119629
at pixel (984,499); the matching material difference is 0.0076904 with unchanged
roughness. The [same-fragment float32 probe](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-input-boundaries.json)
classifies these captured outcomes: the first crosses the authored pebble hash
cell boundary; the second crosses an observed SDF sampling precision boundary.
The [earlier term survey](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-input-terms.json) locates the affected
material terms, but cannot establish cross-variant interpolator identity. The control counts every failing pixel, classifies source cap hits,
and retains a bounded list of the worst 16; it grants no classification-based
exemption. No full scene or game-appearance parity is claimed.

Paired `golden-*-raw.png` / `golden-*-three.png` files in the [review assets](../../../../specs/battle-performance/assets/02-raw/terrain/) show the HDR
arrays through the same already-controlled native post transform. They are
partial-scene diagnostic captures, not a full beauty or performance verdict.

Start `bun run --cwd web vite --config vite.terraincheck.config.ts --host 127.0.0.1
--port 5199`, obtain the coordinated GPU slot, then run
`node apps/battle-perf-lab/candidates/terrain/verify.mjs`. Set `TERRAIN_CHECK_URL`
to select another port or the explicitly separate projection diagnostic.

The fresh unprimed review found no concrete difference between the image pairs.
The larger camera made the silhouette reviewable. Both images share the stepped
dark line along the right ridge base, the angular notch beneath the left mountains,
and the cropped block at upper right. These shared features are not evidence of
a new renderer defect; the critique does not override the strict numerical gates.

The [readable-view canonical diagnostic](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-visual-canonical.json)
eliminates its 67 wall-cap differences, while both ground-detail outcomes remain
bit-identical to the source-projection comparison. That isolates these two causes:
coplanar depth selection is projection-sensitive; ground color follows the
captured interpolator/lookup thresholds. This is a bounded classification of
observed samples, not a generic allowed-pixel budget. No shader math, SDF content,
or numeric gate was changed to remove the failures.

`?shaders` uses Three's public `renderer.debug.getShaderAsync` to save actual
compiled vertex/fragment WGSL under `/tmp/terrain-shaders`. `?visual&canonical`
records a separate result and cannot overwrite the production-projection gate.

The TypeGPU adapter owns typed geometry/index buffers, RG8 SDF upload, bind groups,
render pipelines and render-pass submission. It consumes the shared material
function bodies and TypeGPU environment; it never calls a raw render pipeline.
The pinned library's public experimental command encoder supplies the borrowed
HDR/depth attachment pass, including optional four-sample resolve. Its canonical
camera buffer remains caller-owned after disposal. Production Vite configuration
is unchanged; only this isolated control uses the TypeGPU transform plugin.

Select `?backend=typegpu` and optionally `&samples=4`. The
[one-sample matrix](../../../../specs/battle-performance/assets/02-typegpu/terrain/terrain-1x-ordinary-vertex-normal.json)
passes every ground case with exact coverage. The
[four-sample matrix](../../../../specs/battle-performance/assets/02-typegpu/terrain/terrain-4x-ordinary-vertex-normal.json)
also preserves coverage and passes ground material, but ground beauty remains
red: 79 pixels across the matrix exceed 0.005 (maximum 0.0705566). The matched
[native four-sample readable case](../../../../specs/battle-performance/assets/02-raw/terrain/terrain-4x-ordinary-visual-vertex-normal.json)
also retains one beauty failure (0.0406494). Moving geometry-normal preparation
to the actual source vertex stage did not change these results. These unresolved
multisample shading differences block component parity; there is no relaxed gate.
All these controls completed without GPU errors, page errors or warnings.

The earlier ordinary-position readable captures are retained separately. Their
ground detail passes, unlike the historical invariant capture; full-horizon
coplanar differences remain. Filenames distinguish backend, sample count,
projection diagnostic and normal staging so later controls cannot silently
replace earlier evidence. Neither these partial scenes nor the TypeGPU port
establish complete-backend appearance, temporal stability or performance.

The vgpu runtime borrows the context, camera and environment and lends its draw
commands to the caller's frame pass. Its geometry, terrain state and SDF are
component-owned; samplers and pipeline caches follow the context lifetime. The
pinned API has no texel-upload helper, so the SDF uses a native queue byte upload
to a vgpu-owned texture. Geometry, reflection, pipelines, draw encoding and MSAA
resolve remain vgpu operations. Native and vgpu share the complete pure terrain
shader assembly; TypeGPU consumes its material/noise function bodies through
typed functions. None of these wrappers imports a Three rendering runtime.

The isolated control accepts `?backend=vgpu`. Each adapter owns its appropriate
HDR target and returns the resolved texture for the same numerical readback.
This keeps vgpu's public frame/target contract intact without substituting a
native render pipeline or constructing a private target adapter. Completion waits
are confined to this numerical harness, not the terrain component's draw path.

The [vgpu one-sample matrix](../../../../specs/battle-performance/assets/02-vgpu/terrain/terrain-1x-ordinary-vertex-normal-runtime-targets.json)
passes the ground gate. Its [four-sample matrix](../../../../specs/battle-performance/assets/02-vgpu/terrain/terrain-4x-ordinary-vertex-normal-runtime-targets.json)
retains the same 79 ground beauty failures and maximum difference as TypeGPU,
while ground material and exact coverage pass. Horizon cap differences remain
explicitly red. All runs have finite output and no GPU errors or console warnings.
Raw one-sample and TypeGPU four-sample regressions retain their established
outcomes with the runtime-owned test targets. The recorded results prove the
bounded component behavior only; they do not establish full-scene parity.
