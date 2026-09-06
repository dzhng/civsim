# Scalar far-property transfer

The far representation now stores authored properties, not a picture of one
lighting direction. Weighted canonical posing remains owned by `poseSoldierMesh`;
`soldierSurfaceNodes` supplies the same unlit scalar properties as the mesh tiers.
The existing 64 view directions, 96-pixel tiles, common model anchor, uniform
billboard span, minimum screen size, and nearest-view selection remain unchanged.

One instanced geometry draw fills all views; a preceding trivial MRT zero-fill
draw establishes transparent coverage in every attachment. This is necessary:
Three's ordinary clear gives auxiliary attachments alpha one, regardless of the
first attachment's clear alpha. Canonical model attributes and interleaved view
attributes fit the default eight-buffer WebGPU limit. An earlier nine-buffer
version failed the actual GPU validation probe and was corrected.

Albedo uses an sRGB8 render attachment: the shader writes linear values and the
attachment/sampler performs hardware encoding/decoding. Normals and ORM/mask use
linear UNORM8. All transparent property channels are zero, so mip/linear filtering
associates properties with albedo coverage; display unassociates them before PBR
use. There is no baked faction color, light, highlight, or seed variation.

## Evidence and limits

- `battle-model-far-properties` changes one property at a time on identical
  detailed geometry submitted through the production world. Close far shots are
  explicitly diagnostic, not production-camera LOD parity claims. Its broad
  faction-mask examples deliberately set every vertex mask to one; ordinary blue
  with a zero mask is byte-identical after faction and seed changes.
- Roughness changes affect 6,246 near / 8,047 far pixels; metallic changes affect
  7,440 / 8,243. Explicit mask changes affect 8,243 far pixels.
- Independent code review caught a normal-stage bug: the mesh-tier helper wraps
  a varying and hoisted atlas normal samples to transparent billboard corners.
  Far now transforms the sampled normal directly in the fragment stage. Replacing
  authored normals by +Z changes 7,716 pixels. Reintroducing the varying mutation
  produces **zero**, and the dedicated assertion fails (`normal-mutation.json`).
- The existing front/side asymmetric pike and mounted captures retain their
  unchanged silhouette assertion. Near pike centroid is 669.322; far is 669.981.
  WebGPU render-target V is top-origin, unlike the replaced CanvasTexture: row
  selection uses `(row + 1 - localV) / rows`, preserving both tile and orientation.
- Five existing distance captures and nine scalar captures repeat at zero pixels
  difference. Actual production far LOD covers all twenty appearances (320
  soldiers). Default battle submits 15,560 far soldiers in nine crowd draws,
  with no page/GPU errors. No readiness timeout was enlarged.
- A test-only readback probe, never a runtime bake dependency, measured a dark
  linear albedo `.01/.02/.03` as sRGB bytes `25/39/48`; a -Y normal as `128/0/128`;
  and occlusion/roughness/metallic/mask `1/.7/.2/0` as `255/178/51/0`. Transparent
  pixels were `0/0/0/0` in all three attachments after explicit zero-fill.
- The lifecycle unit test injects a render failure and verifies render target,
  active face/mip, MRT, clear color/alpha and auto-clear restoration plus failed
  atlas disposal. The existing facing/anchor test now also pins the normal yaw
  instance attribute and delegation of atlas disposal.
- Final independent code re-review found no remaining concrete correctness,
  lifetime or test defects. Typecheck passed there; its read-only sandbox could
  not write Vite's test cache. The direct worktree run passed both unit tests.

## Resource envelope

One 768-square atlas allocates 11,796,456 nominal bytes: three complete 8-bit RGBA
mip chains plus one 32-bit depth attachment, no MSAA. Twenty atlases therefore
reserve **235,929,120 bytes (about 225 MiB)**; full replacement temporarily retains
both sets, **471,858,240 bytes (about 450 MiB)**, excluding unrelated world
resources and backend alignment. These are format/dimension accounting, not an
OS residency measurement.

The real renderer texture count during full reload was **102 → 183 → 102**:
new resources coexist before old crowd disposal, and the count returns exactly.
That reload took 2,974 ms including fetching and presentation in the shared
SwiftShader verification run. Fresh-page initial readiness was 473–648 ms in
isolated runs; the first cold shader+bake CPU submission was roughly 12–21 ms,
later appearances roughly 1–5 ms. Single-appearance diagnostic construction took
2.2–5.4 ms (CPU factory time, not a GPU-completion benchmark). Main owns the
unchanged combined hardware gate and final acceptance of this provisional budget.

## Visual judgment / change ledger

The unprimed image reviewer (`critique.md`) confirms material response and the
flat-normal control differ visibly, and sees no broad transparency halo. It also
flags stronger smooth far highlights than near, jagged thin weapons, angle-driven
silhouette collapse, ambiguous frontal mounted silhouettes, and coarse near
shadows. The retained coarse view bins and tiny raster tiles are **not** visual
quality acceptance: far quality belongs to slices 15/28 and mounted geometry to
21. The intentionally uniform whole-body diagnostic mask is not mask leakage.
The nine-cell montage's row seams are crop composition, not render seams.

Five existing far-bundle baselines change because both near explicit scalar
materials and far live PBR replace their previous material paths. Their geometry,
camera, counts and silhouette thresholds do not change. Nine new diagnostic
baselines pin scalar/normal/mask behavior; they do not approve placeholder art.
No model geometry, animation, lighting preset, terrain, or live-battle rule changed
in this far lane.
