# 09 — Shared water depth, surf and motion

Status: complete; material accepted, exact-repeat and merged water controls verified. Dependencies: [05](05-terrain-material.md), [08](08-water-boundaries.md).

## Contract and owner

Extract the existing physical water response from battle sea orchestration into the common landscape waterMaterial owner. Battle ocean/lake/field shapes remain local consumers.

Slice variable: **Water material and restrained animation on fixed water geometry.**

## Work

Feed independent coverage, signed shore distance and depth/proxy inputs into the shared response. Give campaign sea visible turquoise shallows and deeper offshore color rather than reusing the bounded battle field-water ramp. Add broken shore surf and restrained normal/motion detail tied to the canonical water domain; rivers and lakes use appropriate profiles of the same response. Preserve exactly one linear conversion and one light/environment source. Mask every effect so it cannot sparkle on land. All animation uses the owned injectable clock.

## Runnable checkpoint

The landscape-water scene and terrain-water retain fixed near/deep/shore crops plus a short frozen-time sequence and looping GIF. Include a battle field-water/ocean boundary.

Both scenes run through the existing scene runner and exact snapshot primitive.

## Verification and review

Color-response probes for shallow/deep separation without hardcoding the reference image colors, water-only effect masks, phase-return determinism and no land glint. Run terrain-water and relevant photoreal-sea/campaign water-sea scenes. Follow write-vibe for the sequence: inspect every frame and ship a GIF.

Crop/mask: Shallows/offshore/surf/river-junction crops. Coast shape, mountains, vegetation and lighting are frozen. Terrain labels and UI are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Depth ramps, wave/foam amplitudes, wavelengths and normal detail falloff are delegated within the water and performance contracts. No second sea shader or unowned time source.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Preference for calmer/brighter water changes the water profile. The reference remains the baseline for depth and shore articulation.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Shared owner checkpoint

The existing response now lives in `landscape/waterMaterial.ts`; terrain, ocean and lake consumers import it directly. Geometry and displacement remain mode-specific. The [extraction control](../assets/slice-09/owner/README.md) preserves the prior water output. Next add separate campaign coverage/shore/depth inputs and review the composed water; this extraction alone does not complete09.

## Source-distance response checkpoint

The [response evidence](../assets/slice-09/response/README.md) now covers explicit source-shore capability, bounded campaign depth proxy, weak clock-driven normal detail, broken shore lace and fixed-source dry-pixel controls. CampaignWorld and the regional route consume it; battle and synthetic field fixtures retain the existing response. Seven exact repeat frames and all CPU tests pass. Regular wave bands were rejected. This initial checkpoint was not visually accepted; the finish below resolves its pending critique.

## Accepted material response

The [focused finish evidence](../assets/slice-09/finish/README.md) resolves the fresh critique of uniform shallow halos and isolated foam dabs. Existing multiscale noise varies scattering and surf; screen-footprint contrast keeps regional surf readable while close narrow-water interiors stay blue. The final independent review accepts the material pass, with softer western-coast surf documented as an acceptable simplification. Geometry, palette and environment remain fixed; whole-landscape acceptance stays with slice10.
