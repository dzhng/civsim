# 04 — Connected mountain form and foothills

Status: in progress. Dependencies: [01](01-surface-contract.md), [03](03-bounded-terrain.md).

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


## Independent form investigation

The raw-mask and extracted-spine replacements were rejected by fresh visual comparisons: they created walls, fins and circular depressions while losing the starting relief's connected valleys and broad slopes. The implementation direction is therefore a smaller improvement to the existing geographic height envelope: sampling-safe crests, restrained fine detail, and a broader low coastal transition. No new range graph or source mask is retained. This replaces the initial assumption that a separate mask-driven ridge algorithm was necessary; the source geography and one geometry owner remain authoritative.

Local foundation probes covered all 401 in-bounds settlements using the actual city meshes, but the candidate produced circular shelves in clay views. That implementation is deferred to slice12; existing source aprons and placement behavior remain authoritative in this pass. The detailed-grid result is distinct from coarse overview seating. Evidence, rejected paths, allocation boundaries and review results are in [the form investigation](../assets/slice-04/README.md). The independent pass accepts only a bounded perimeter/serration cleanup. The fresh reviewer explicitly leaves the larger valley/foothill character open; tiled-world integration and final verification remain pending.

## Downhill-link incision boundary

The [bounded valley-incision probe](../assets/slice-04/valley-incision/README.md)
was rejected at the first close clay fixture. Local downhill links over the
existing source height create diagonal trenches/ribs and isolated nubs; query
cost also rises about 3.4× in the fixture sample probe. No regional captures or
baseline changes follow, and all candidate production code is removed. Revisit
the source-form model before trying another local-link or noise adjustment.

## One landform owner

The source height producer and presentation relief both shape ranges, but removing the source modulation did not produce enough visual benefit to justify changing source-derived cover and city heights. Keep that source fixed for the next relief-profile comparison. The rejected directional filter and its primary research remain in the evidence below. Use close clay for sampling/coastal correctness and fixed real regional clay for branching/open-valley judgment. No new schema, cache or dependency is needed for this isolated profile assessment.

## Directional synthesis boundary

The [stateless directional-erosion investigation](../assets/slice-04/directional-erosion/README.md)
replicates the published kernel and removes duplicate source crest modulation.
A measured bilinear-gradient height discontinuity was repaired with local C1
height reconstruction. Corrected close clay still fails the landform target;
1km geometry smooths some steps but retains the wall/pillar form at almost four
times the fixture triangles. The candidate is rejected, all production/test
edits are removed, and no regional captures or parameter sweep follow. Future
directional synthesis must satisfy the continuous-gradient input contract and
its actual mesh sampling limit before visual acceptance can be assessed.

The same-camera plain-base control separates two causes: the wall persists
without erosion because the synthetic fixture imposes a continuous Gaussian
ridge, while the thin pillar and sharp repeated zigzags disappear. Keep this
fixture for sampling and coast checks; the next form assessment also needs a
fixed real regional clay view to judge branching, open valleys and foothills.
Source-imposed continuity alone is not evidence against a synthesis algorithm.
The current filter remains rejected for its added artifacts; no replacement is
accepted or implemented by this diagnostic.

The [real regional source-only control](../assets/slice-04/source-crest-control/README.md)
is also rejected. Removing source crest modulation while retaining accepted
relief slightly improves some Alps junctions but leaves walls/fins/shelves;
Italy is a tie. Natural Alps shows no clear benefit, while source-derived cover
and city-area heights change. Keep the source unchanged for the next isolated
relief-profile assessment; duplicate shaping removal is not justified solely as
an architectural simplification. No new profile is accepted by this evidence.
