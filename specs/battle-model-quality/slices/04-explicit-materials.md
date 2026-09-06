# 04 — Explicit material round trip

Status: COMPLETE — material-transfer acceptance only. Depends on [03](./03-weighted-asset-contract.md).

## Contract and ownership

Surface identity is authored data, never inferred from RGB.

API seam: soldier-assets material slots/texture manifest → photoreal crowd material inputs; base color, normal, roughness, metallic, UV/tangent channels and independent faction-color mask.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Six neutral swatches on a bent fixture: skin, cloth, leather, mail, wood and metal. Compare standard loader and production under matched lighting.

### Execution rows

| Row | Seam and focused proof |
| --- | --- |
| 04a — Explicit surfaces | Bind scalar material slots and independent faction masks in retained consumers. Same-color swatches with different roughness/metallic values must differ; an ordinary blue surface must not become a faction accent; changing instance seed must not change its color. Placeholder construction declares surface identity, never reconstructs it from RGB. |
| 04b — Texture transport | Preserve embedded image bytes, color spaces and declared UV/sampler behavior. An asymmetric checker, multiple slots and atlas-edge checks expose flips, cross-slot sampling and bleed. Missing or unsupported source texture features fail explicitly. |
| 04c — Posed normal frame | Skin tangents with the same weights as geometry/normals and retain tangent handedness. Bent and rotated samples must preserve the intended normal-map response; a stock unskinned tangent basis is not sufficient for the custom VAT path. |
| 04d — Consumer and review closure | Six swatches through the production workbench and standard-loader oracle, plus raw/far material-consumption checks, reload/disposal and the standing hardware gate. Raw lighting need not equal Three PBR pixels, but no retained consumer may ignore the authored channels or infer identity from RGB. |

The source material set remains the sole owner, shared across tiers. The far
representation must consume authored surfaces in this slice; atlas density and
final distance readability remain15/28. Decide and measure its bake mechanism
before implementation rather than preserving the color-only CPU painter as an
undocumented exception. No detailed anatomy or armor styling is accepted here.

### 04b authoring and resource envelope

Use one source-owned texture set per appearance, shared across its material slots
and tiers: base color, normal and packed occlusion/roughness/metallic. Each channel
may have its own image dimensions and sampler; do not resize base images or combine
competing source images. Independently exported tiers may reference identical bytes
under different local indices. Identity follows image content and normalized
sampler settings, not a whole-export hash.

Each slot independently declares base-color, normal, metallic/roughness and
occlusion use. Normal scale and occlusion strength remain authored values. A slot
using metallic/roughness alone must not acquire occlusion from the image's red
channel. Where both reference textures, their image bytes and sampler must match.
UV0 is the supported coordinate set; reject conflicting images, other UV sets,
texture transforms and unsupported material extensions explicitly. Opaque materials
are the envelope; do not silently reinterpret transparency.

The material file becomes one complete surface-set description rather than an
array accompanied by a second texture manifest. Change all owned producers,
consumers and fixtures together; no legacy array reader. Preserve embedded PNG/JPEG
bytes and resolve their emitted relative paths against that material file. Missing
channel declarations mean no map; declared resources that fail to fetch, decode or
prepare reject the replacement. `_FACTION_MASK` is an independent Blender vertex
attribute: absence means unmarked, never RGB inference; malformed present data
rejects. The source lane owns its real-export proof.

Loaded assets retain immutable encoded bytes, not shared live image bitmaps. Each
prepared GPU surface owner decodes its own images, performs checked uploads and
mipmap generation, closes decoded images and owns the resulting GPU textures.
Near rendering and far baking share one prepared surface; independent crowds and
the raw renderer do not share disposable GPU ownership. No canvas readback or
per-material draw splitting is introduced.

Use the installed public Three `ExternalTexture` API over the checked upload owner.
A disposable real-browser tracer has proven dimensions, orientation, sRGB/data
sampling, explicit and implicit mip selection, wrapping, bitmap closure and wrapper
versus GPU ownership. This does not prove the new mip generator: implement and test
that separately, including linear-light averaging for base-color mips. Preserve
the source's magnification, minification and mip filters; the existing checker
already requires mipmaps. Normal maps may be transported in04b but posed shading
is accepted only after04c proves the weighted tangent frame and handedness.

### 04c posed-frame envelope

The existing tangent XYZ/W vertex field and joint-matrix VAT are sufficient.
Transform tangent XYZ with the same four-weight linear matrix used for normals;
preserve the existing blended-normal convention rather than introducing an
inverse-transpose lighting change. Normalize both directions at each posed vertex
before interpolation. Preserve authored handedness W across mirrored
UV seams. Instance yaw and corpse roll transform both directions. At fragments,
orthogonalize the interpolated tangent against the normal and reconstruct the
bitangent from their cross product and W. Decode the linear normal image, apply
authored scale to XY, then transform and normalize that direction. Near and raw
shade this posed result; far bakes it once into its model-space normal property.

Normal-mapped vertices require usable nonzero, nonparallel normal/tangent vectors
and W of minus or plus one. Unmapped placeholder vertices do not acquire that
requirement merely because another slot has a map. The source baker rejects
unusable mapped frames at its sampled poses; loading validates the mapped bind
frame. Fragment interpolation can still collapse a direction, so define a finite
geometric-normal result for that degenerate limit instead of propagating NaNs.
This is not a substitute for admitting invalid mapped source frames. Preserve the
existing authored-backface policy and the exact untextured shading path.

Use the shared squared direction floor `1e-12` for relative source-frame
parallelism and cancellation of interpolated unit directions. Collapsed normals
fall back to the authored face direction reconstructed from position derivatives;
collapsed tangents fall back to the geometric normal. Small nonzero decoded map
vectors remain directional: bound components before normalization rather than
applying an absolute magnitude floor to authored normal-map scale. Scale must
remain finite when packed into Float32, and scales only XY, including at zero.

Normal-image sampling must remain in the fragment stage, not pass through the
existing helper that hoists geometric normals into a vertex varying. Verify bent,
rotated and mirrored-UV cases with independent directional controls before judging
lit screenshots. Replace04b's temporary dormant-normal assertions with those
response checks; do not simply delete their coverage.

### Far-material mechanism and resource gate

Replace the private CPU painter with a GPU material-property atlas using the
production surface-node owner. Store albedo/coverage, posed model-space normal,
and occlusion/roughness/metallic/faction mask; light the sampled billboard with
the existing standard material and production environment. Do not bake lighting
into color: an independently turning soldier would otherwise retain highlights
from the wrong direction. Keep existing view selection, bounds and tile density
while measuring this mechanism.

Initialization and reload become explicitly asynchronous, preparing a complete
replacement before exposing it. Atlas baking restores renderer state before
yielding; no readback belongs in live playback. The current catalog's three
RGBA8 property targets would cost about135MiB before depth/mips, versus one color
target today. Record actual allocation, peak reload memory, cold compile/bake time
and single-appearance reload time. This mechanism is provisional until that
measurement and the unchanged standing hardware gate pass;07 still owns the
final authored-asset envelope. Do not accept a route-readiness timeout increase
as a substitute for controlling startup work.

The production fixture is runnable against the configured verification server:

```sh
VERIFY_GPU=1 node web/scene.mjs battle-model-material-swatches
```

## Focused verdict

Variable: **Material transfer fidelity**.

Crop/mask: Swatch crops only, fixed exposure/light/pose; detailed armor design and anatomy excluded.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Checker orientation, normal-map handedness, texture color spaces and faction mask tests; replace RGB-based soldierMaterials expectations. Uniform instances remain visually identical independent of seed.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/04/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Atlas packing and shader implementation; authored surface maps created locally in Blender/scripts, no external generation service. Reserve opacity only if a real authored part needs it.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [x] Contract and runnable artifact implemented.
- [x] Execution rows, if any, each have evidence and verdict.
- [x] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [x] Comparison and final unprimed critique recorded.
- [x] Review/cleanup completed; README pickup and decisions updated.

04a–04d are complete. [Consumer closure](../assets/evidence/04/consumer-closure/review.md)
records the integrated gates and material-transfer checkpoint. Scalar implementation and scoped visual evidence are recorded in
[integration review](../assets/evidence/04/integration-review.md), with source,
raw and far lane reports beside it. The combined workbench proves independent
scalar response, seed uniformity, explicit faction masks and material-table
reindex invariance. The standing30k hardware gate passes.

04b's [integrated texture report](../assets/evidence/04/texture-transport/review.md)
records exact source image/sampler transport, shared near/far and retained raw
consumption, independent channel oracles, malformed-image rollback, teardown
regressions, reviewed checker captures and the passing standing hardware gate.
The material container replaces the scalar array atomically; no legacy reader or
unused per-material source-reference path remains. Original GLBs remain source
provenance, not a second runtime material owner.04b's temporary no-shading assertion
has now been replaced by04c's directional-response proof.

04c's [posed integration report](../assets/evidence/04/posed-material-integration/review.md)
records source admission, CPU tangent posing, shared near/far shading, retained raw
lighting, independent direction and collapse controls, exact inherited snapshots,
review and the passing standing hardware gate. The canonical renderer runner now
includes `battle-model-normal-frame`.04d's matched production/standard-loader
scene and source fixture are accepted for faithful transfer, not finished material art.

GPU admission now rejects actual invalid commands and disposes the replacement
while preserving the prior scene. Renderer state and scopes are restored before
yielding, and main revalidates the author's active pose before installation.
Malformed material factors also reject before GPU preparation rather than silently
installing invalid floating-point texture values. Mutation tests prove both guards.

The confirmed contact-darkening mismatch is corrected:
matched stable near/far interiors agree within one RGB code after disabling
near-only contact darkening. Far now shares that factor through unused
normal-atlas alpha, independently of authored occlusion, with a live corpse gate.
Merged strict scenes, independent focused critique and the standing hardware gate
pass. All near snapshots remain exact; only far lower-body pixels intentionally
change. Controlled nearest-filter and half-float probes classify residual bright
boundary bands as filtered normals crossing coarse rasterized edges, not increased
material illumination; retain those controls with the distance-quality debt.

The single-sample far bake and retained depth targets are provisional resource
choices, not final edge-quality approval. Final distance-quality decisions still
belong to15/28, but unexplained material defects cannot be deferred there.
