# 04 — Explicit material round trip

Status: IN PROGRESS. Depends on [03](./03-weighted-asset-contract.md).

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

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

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

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

04a implementation and scoped visual evidence are recorded in
[integration review](../assets/evidence/04/integration-review.md), with source,
raw and far lane reports beside it. The combined workbench proves independent
scalar response, seed uniformity, explicit faction masks and material-table
reindex invariance. The standing30k hardware gate passes. No04a final integration
commit or04b–04d acceptance is claimed yet.

Two audit findings remain on the04a critical path:

- A resolved bake promise must mean GPU resource admission succeeded, not merely
  that commands were submitted. Scope-based validation must reject actual invalid
  GPU commands and dispose the replacement while preserving the prior scene.
  Restore renderer state and pop scopes before yielding. Revalidate the author's
  active pose before installation because that new wait admits UI changes.
- Stronger far highlights cannot be labeled distance debt without a controlled
  comparison separating authored-property transfer, normal transformation,
  quantization and view approximation. Previously refreshed multi-slot images
  also contained an interpolation defect; main fixed it with flat integer IDs.

The single-sample far bake and retained depth targets are provisional resource
choices, not final edge-quality approval. Final distance-quality decisions still
belong to15/28, but unexplained material defects cannot be deferred there.
