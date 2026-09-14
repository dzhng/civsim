# 04 — Connected mountain form and foothills

Status: pending. Dependencies: [01](01-surface-contract.md), [03](03-bounded-terrain.md).

## Contract and owner

Redesign the campaign relief owner from the source range identity. The renderer-neutral field generates geometry; the material and scenery layers do not invent independent mountain bodies.

Slice variable: **Geometry: silhouette, dominant ridges, valleys, and foothill decay.**

## Work

Compare the current warped-noise relief with a connected ridge hierarchy constrained by the source mountain mask. Give ranges dominant spines, secondary branches, broad faces, readable valleys and gentle feet. Use noise as subordinate detail rather than the entire structure. Replace the broad blur/height-envelope inheritance that destroys range structure. Keep existing city/road coordinates; local settlement seating constraints may shape the immediate ground but must not cut empty holes through whole ranges. Preserve existing geographic water channels; do not invent new major rivers from noise or add an erosion simulator by default. Retire the losing candidate code after its verdict.

## Runnable checkpoint

Planned landscape-mountains scene with neutral clay captures on a reference-inspired coastal ridge fixture, real Alps, and real Apennines at regional and close production pitch.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Surface, coast and tile-join tests remain green. Check deterministic field generation and connected geographic range identity, but use visual evidence for whether the landform reads naturally. Prove a larger mesh resolution changes silhouette sampling rather than only increasing triangle counts. Existing campaign map alignment remains the geographic guard.

Crop/mask: Dominant crest/valley/foothill crops from validation.md plus full frames. Material color/texture, foliage, surf, and final lighting are explicitly frozen or hidden in clay mode.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Ridge extraction algorithm, branch frequencies, crest profiles and visual height exaggeration are delegated to bounded comparisons. Geographic identity, connected range ownership and no new gameplay terrain are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A requested prominence/height change alters the profile. The agent can choose the profile from the reference without waiting for approval.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
