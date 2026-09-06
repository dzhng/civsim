# 04a — Retained raw material consumer

## Scope and verdict

The raw campaign consumer now shades authored material IDs, linear vertex
colors/base factors, roughness, metallic, and independent faction masks. It
does not classify blue/bronze/linen from RGB or vary color by instance seed.
This accepts **scalar transfer and readable diagnostic depth**, not improved
placeholder art or Three-PBR parity. Texture transport and normal maps remain
04b/04c; full oracle comparison remains 04d.

The raw lighting style retains its diffuse grading and approximates indirect
specular with a hemisphere derived from its existing fill light. Roughness
blurs that reflection toward its mean; view-dependent Fresnel and a half-vector
directional highlight preserve facing cues. Shared display-referred key/fill
colors are decoded before linear shading, and the directional lobe is gated
by positive N·L. Output is encoded for the raw unorm canvas.

## GPU ownership

Each distinct material array has one RGBA32F table shared by its mesh tiers.
The canonical soldier-assets packer owns the two-row layout. Raw vertices keep
the shared 26-float layout; material IDs and faction masks reach the shader as
explicit attributes. No placeholder sampler or neutral normal/ORM texels remain.

Construction rolls back allocated tables, VATs and mesh resources on failure.
`SkinnedCrowdPipeline.dispose()` releases them exactly once; campaign teardown
calls it. The existing growable buffer owner now releases replaced allocations
and exposes disposal. Previously submitted GPU work retains its resources;
callers still rebuild references when growth reports reallocation.

## Evidence and exact scope of the comparisons

- [Authored diagnostic](diagnostics/soldier-materials-authored-actual.png),
  [ordinary blue](diagnostics/soldier-materials-blue-actual.png), and
  [uniform metal](diagnostics/soldier-materials-metal-actual.png) use frozen
  at-ease pose, fixed 1280×800 viewport and SwiftShader. The lab camera now uses
  a torso-height target and three-quarter view; its previous top-down framing
  did not expose the surfaces being judged. These are existing block fixtures,
  not the later anatomy/armor models.
- [Fresh pre-change army](reference/army.png) and
  [current army](candidate/army.png) use the same hardware-Chrome capture,
  static one-frame campaign fixture and camera. These are diagnostic comparisons,
  not hardware re-blesses. [Telemetry](comparison/visual-parity-diff.json):
  distance 0.00713, grayscale MAE 0.44179, edge-energy ratio 0.98931, mean
  luminance delta −0.35494. Geometry, terrain, ring and flag remain framed alike;
  the material change darkens/mutes some warm figure surfaces.
- A claimed finial movement against the older committed baseline was checked
  against the fresh pre-change runtime: the finial/top-pole rectangle
  `[470,260,29,51]` has zero differing pixels. The older accepted image differs
  by nine pixels there. The campaign fixture draws once with camera time zero;
  no animated capture or material-induced attachment movement was found.
- Thin forearm/arm edges and crowded gear remain visible. The
  [same-camera old-shader diagnostic](diagnostics/same-camera-old-shader.png)
  retains the same geometry/overlaps. The source pass also proved positions,
  indices, weights and normals unchanged across all placeholder tiers. Do not
  infer a newly detached limb from material contrast; geometry cleanup belongs
  to 08/09.

## Verification

Run from `web/` with this worktree's Vite server:

```sh
VERIFY_GPU=1 VERIFY_URL=http://localhost:5181 node scene.mjs soldier-materials
bun run typecheck
bun run test gpuBuffers skinnedPipeline
```

The focused browser probes retain the body/shield and small-band checks and
prove: reversing material table order with a matching vertex-ID remap is
byte-identical; changing factions with the mask disabled is byte-identical; changing
seed is byte-identical; equal gray albedo responds independently to roughness
and metallic with faction strength zero. The band changes 898 sampled pixels
(0.378%); roughness and metallic comparisons each change 51,669 sampled pixels.
The unlit front plane has mean RGB `[55.7146,68.1250,90.9917]` both with and
without the key light. Removing only the N·L gate in a browser-local shader
mutation changes the key-on mean to `[112.1375,108,109]`, so that equality check
detects the original defect while readable fill remains.

Full typechecking and four focused unit tests pass. Public GPU-boundary tests
cover per-appearance table values/binding, material/mask upload, unchanged
uint32 indices and nonloop endpoint phase, idempotent disposal and rollback
after a later appearance's material allocation fails.
The [final no-update report](final-checks.json) passes every material probe and
all three diagnostic snapshots at **zero differing pixels**.

## Review and remaining visual findings

Independent resource/code review found no concrete defects. A separate shader
review identified the light-color decoding and N·L issues; both were fixed and
the browser N·L mutation above verifies the new regression check.

Fresh unprimed critique initially rejected nearly black/flat metal. A constant
fill alone still compressed planes, so the final shader uses the directional
reflection described above. Final immutable-v3 critique found readable authored
surfaces and metal's large planes, intact silhouettes and no new clipping.
Uniform blue/metal deliberately remove material boundaries; they are not
accepted as convincing final metal art. The final army critique found unchanged
framing/finial/geometry but **lower readability of warmer skin/head/limb regions**.
Keep this negative finding for final authored surface owners 18/22/26; do not
undo correct color-space transfer to imitate the old RGB shortcuts.

The integrating task archives the verbatim final critique and owns the combined
Preview feedback checkpoint. No user endorsement is inferred here.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `gpuBuffers`: growable floor/doubling | Pinned 128→256→512-byte growth and three writes; no destruction checks. | Same growth/writes; replaced buffers destroyed once, live buffer disposed once, writes after disposal rejected. | Resource ownership must survive growth and teardown. **moved** |
| `skinnedPipeline`: appearance/LOD lookup | Pinned sparse appearance clip/geometry selection, uint32 indices and nonloop phase 1. | Preserves those checks; additionally pins two 2×2 material tables (128 total bytes), explicit ID/mask uploads, appearance material binding, complete disposal and partial-construction rollback. | The public raw consumer now owns explicit material resources. **moved** |
| `soldier-materials`: faction body/shield/band | 900×620 flow capture; RGB-inferred blue band, body/shield average difference <5 and changed region >8 pixels and <1.2%. | Fixed 1280×800 three-quarter visual scene; same bounds tested with ordinary-blue albedo and explicit mask (898 changed pixels); three zero-tolerance snapshots. | A visual contract needs readable geometry and a persistent gate, not a color classifier. **moved** |
| `soldier-materials`: scalar/seed/light checks | No assertions. | Byte-equal table permutation/ID remap, unmasked factions and seeds; scalar-only roughness/metallic changes; unlit plane key-on/off equality with positive fill. | Pins independent authored channels, categorical indexing and the reviewed back-facing highlight bug. **moved** |
| `campaign-models`: army observation | Existing accepted baseline and unchanged scene tolerances. | Same scene/assertions and no baseline rewrite; current color movement reviewed through the matched fresh pair above. | Linear materials intentionally change figures; reduced warm-surface readability remains explicit art debt. **moved** |

Static vertex/index-buffer assertions are unchanged apart from adding a real
`destroy()` operation to the GPU test double. No simulation or unit-stat inputs
changed. Source rebakes and the shared material owner belong to the integrating
passes, not this raw-consumer commit.
