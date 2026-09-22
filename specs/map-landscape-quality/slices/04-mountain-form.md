# 04 — Connected mountain form and foothills

Status: in progress. Dependencies: [01](01-surface-contract.md), [03](03-bounded-terrain.md).

## Acceptance state

| Accepted | Remaining | Evidence |
| --- | --- | --- |
| Existing geographic envelope and downward-only saddle articulation; unchanged production sampling | Distinct range hierarchy, readable valleys and broad foothills in the final regional composition | [Saddle pass](../assets/slice-04/downward-saddles/README.md) |
| Road-width correction after changed terrain seating | Judge form separately from source rock coverage, planting and lighting; a material recolor alone does not close this slice | [Road pass](../assets/slice-11/road-surface-width/README.md), [integrated matrix](15-acceptance.md) |

Current pickup is the combined campaign reference pass in the README. The source-rock/slope gate was rejected as thin green edging on unchanged
rounded ridges. Target broader valley floors/intermediate shelves inside the
accepted geographic envelope; see [the control](../assets/slice-04/source-slope-control/README.md). The investigations below are historical evidence, not an active
queue of algorithms or parameter sweeps.

## Contract and owner

Redesign the campaign relief owner from the source range identity. The renderer-neutral field generates geometry; the material and scenery layers do not invent independent mountain bodies.

Slice variable: **Geometry: silhouette, dominant ridges, valleys, and foothill decay.**

## Work

Preserve geographic range identity while improving dominant crests, secondary branches, readable valleys and gentle feet. Comparisons rejected the first source-mask and extracted-spine replacements, so a new algorithm is not a requirement in itself. Retain the existing geographic envelope until a replacement wins the visual comparison. Keep city/road coordinates and existing water channels; do not add an erosion simulator or use local settlement grading that creates circular craters. Retire losing candidate code after its verdict.

## Runnable checkpoint

The [mountain scene](../../../web/scenes/campaign/landscape-mountains.mjs) isolates form with neutral clay views of a coastal ridge fixture, real Alps and real Apennines at regional and close production pitch. It also exposes coarse sampling separately from the detailed mesh. Natural regional scenes remain the shared-material integration guard.

## Verification and review

Surface, coast and tile-join tests remain green. Check deterministic field generation and connected geographic range identity, but use visual evidence for whether the landform reads naturally. Prove a larger mesh resolution changes silhouette sampling rather than only increasing triangle counts. Existing campaign map alignment remains the geographic guard.

Crop/mask: Dominant crest/valley/foothill crops from validation.md plus full frames. Material color/texture, foliage, surf, and final lighting are explicitly frozen or hidden in clay mode.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Ridge extraction algorithm, branch frequencies, crest profiles and visual height exaggeration are delegated to bounded comparisons. Geographic identity, connected range ownership and no new gameplay terrain are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A requested prominence/height change alters the profile. The agent can choose the profile from the reference without waiting for approval.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.


## Historical investigations and rejected alternatives

These verdicts constrain future experiments; they are not pending work. No new
algorithm is required if the existing owner can meet the visual contract.

| Investigation | Durable finding | Evidence |
| --- | --- | --- |
| Raw-mask/spine replacements and local city foundations | Walls/fins and circular depressions lost connected valleys; keep geographic envelope and resolve actual city contact under12 | [Initial form investigation](../assets/slice-04/README.md) |
| Downhill-link incision | Added diagonal trenches/ribs and query cost without better form; do not repeat local-link/noise tuning without a new source hypothesis | [Valley incision](../assets/slice-04/valley-incision/README.md) |
| Directional erosion | Continuous gradients and mesh sampling matter, but correcting those did not remove the wall/pillar form; candidate removed | [Directional control](../assets/slice-04/directional-erosion/README.md) |
| Removing source crest modulation | Did not justify changing source-derived cover and city heights; architectural duplication alone was insufficient reason | [Source-only control](../assets/slice-04/source-crest-control/README.md) |
| Signed relief profile | Better interpolation error produced rounded curtains and lost summit/valley hierarchy | [Signed profile](../assets/slice-04/signed-profile/README.md) |
| Measured elevation, filtering and scale controls | Regional branching gains did not survive final natural-composition review; no loader, source asset or schema adoption followed | [Elevation control](../assets/slice-04/elevation-control/README.md), [natural review](../assets/slice-04/elevation-natural/README.md) |
| Finer sampling of the accepted field | Reduced interpolation/step error but preserved the wrong regional character at greater allocation cost; no production refinement | [Sampling measurements](../assets/slice-04/accepted-field-sampling/README.md), [visual verdict](../assets/slice-04/accepted-field-sampling/visual/README.md) |
| Raised crest prominence | Clearer peaks amplified walls/fins; keep the accepted height envelope | [Crest control](../assets/slice-04/crest-prominence/README.md) |
| Scalar floor-width controls | Valley compression steepens recovery flanks; valley fill loses low-floor occupancy. A lower-amplitude control remains visually unverified | [Real-source measurements](../assets/slice-04/floor-width-probes/README.md) |
| Downward-only saddles | Accepted bounded articulation in clay, natural regions and production, with exact repeats; whole range/foothill quality stays open | [Adopted pass](../assets/slice-04/downward-saddles/README.md) |

The synthetic coastal ridge fixture isolates sampling/coast defects but imposes a
continuous ridge itself. Use fixed real regional clay for branching and open-valley
judgment, and natural production frames for the combined reference verdict.
Accepted terrain and road fixes are retained; any new source/model proposal needs
a demonstrated visible defect and must preserve geography, water and gameplay.
