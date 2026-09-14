# 09 — Shared water depth, surf and motion

Status: pending. Dependencies: [05](05-terrain-material.md), [08](08-water-boundaries.md).

## Contract and owner

Extract the existing physical water response from battle sea orchestration into the common landscape waterMaterial owner. Battle ocean/lake/field shapes remain local consumers.

Slice variable: **Water material and restrained animation on fixed water geometry.**

## Work

Feed independent coverage, signed shore distance and depth/proxy inputs into the shared response. Give campaign sea visible turquoise shallows and deeper offshore color rather than reusing the bounded battle field-water ramp. Add broken shore surf and restrained normal/motion detail tied to the canonical water domain; rivers and lakes use appropriate profiles of the same response. Preserve exactly one linear conversion and one light/environment source. Mask every effect so it cannot sparkle on land. All animation uses the owned injectable clock.

## Runnable checkpoint

Planned landscape-water scene, retaining terrain-water; fixed near/deep/shore crops plus a short frozen-time sequence and looping GIF. Include a battle field-water/ocean boundary.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Color-response probes for shallow/deep separation without hardcoding the reference image colors, water-only effect masks, phase-return determinism and no land glint. Run terrain-water and relevant photoreal-sea/campaign water-sea scenes. Follow write-vibe for the sequence: inspect every frame and ship a GIF.

Crop/mask: Shallows/offshore/surf/river-junction crops. Coast shape, mountains, vegetation and lighting are frozen. Terrain labels and UI are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Depth ramps, wave/foam amplitudes, wavelengths and normal detail falloff are delegated within the water and performance contracts. No second sea shader or unowned time source.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Preference for calmer/brighter water changes the water profile. The reference remains the baseline for depth and shore articulation.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
