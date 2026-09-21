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

The [signed-profile control](../assets/slice-04/signed-profile/README.md) preserves
source geography and changes only the existing relief owner's crest response.
Its 2km sampling error improves, but fresh real-region critique rejects both
Alps and Italy: rounded curtain-like masses replace readable summits, saddles,
spurs and valley openings. The accepted relief is restored. Numeric smoothness
alone does not satisfy the mountain-form target; no parameter sweep follows.

## Next bounded source-data control

Repeated procedural profile controls have not produced a better regional form.
Test one pre-baked real-elevation input against the existing Alps/Italy framing
before building another shaping algorithm. The campaign map already uses a
known Lambert azimuthal equal-area projection; the spike can sample elevation
into its existing presentation height field. This is a render-source asset
comparison, not a change to battle maps, roads, land/water masks or saves.

First establish projection alignment, input provenance, required attribution,
asset size and sampling error. Then compare a plain elevation-derived height
with the existing relief using fixed cameras/material/light. Keep coast seating
and city contact under their existing owners. No runtime network, new terrain
cache, second rendering backend or production schema is authorized by the spike.
If it wins, specify the single existing loader/field seam and rebuild workflow
before adopting the asset; if it loses, retain evidence and remove spike code.

[Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) supplies
open raster elevation. [Tilezen format documentation](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
explains the encoded inputs; its [attribution requirements](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
apply to derived data and must be retained. Use only the small region needed for
the first control. This candidate tests geographic branching already present in
measured data, rather than another tuning of enclosing procedural ridge contours.

The [first measured-elevation control](../assets/slice-04/elevation-control/README.md)
shows meaningful regional branching/foothill gains under fresh critique but is
not accepted:2km point resampling leaves crowded teeth and comb-like fringes.
A single4km area-filtered pre-bake at the same10× exaggeration is now captured.
Fresh critique gives Alps a qualified bounded improvement but withholds Italy
acceptance: reduced detail alone does not establish a better foothill hierarchy.
The filtered pass excludes raster-water samples before averaging. No further
filter sweep or blanket form acceptance follows. Projection, provenance, sampling loss and the proposed
existing-loader seam are recorded with the evidence. No runtime data adoption
or city-apron acceptance follows from the initial clay pair.

A single5× vertical-scale control of the same filteredDEM is preferred over10×
by fresh review in both regions, but neither clears bounded form acceptance:
Alps retains congested gullies/walls and Italy's foothill fringe loses definition.
The2km mesh and height-scale measurements are explicit in the elevation evidence.
No further scale sweep, city-apron acceptance or runtime adoption follows.

The [natural5× DEM/clearance control](../assets/slice-04/elevation-natural/README.md)
is rejected under fresh regional and supplemental closer-Alps review. Existing
city-apron policy is equivalent before its constructor blur, and actual city
models use shared surface contact, but the candidate loses dominant regional
relief and shows repetitive grooves. Tree occlusion prevents a city-contact
acceptance claim. Production terrain and its loader remain unchanged; no further
form/scale sweep follows this natural-composition diagnostic.

## Accepted-field sampling diagnosis

The [fixed-field CPU comparison](../assets/slice-04/accepted-field-sampling/README.md)
measures the current field at2km and1km geometry spacing, separately from the
rejected directional-filter experiment. Over262,144 common dry interior samples,
p95 height interpolation error falls0.2904→0.07789 presentation km while mesh
bytes rise304,817→1,207,601. The field/source is unchanged; differing coast scratch
sentinels do not matter in this fully saturated interior. This justifies a bounded
visual resolution control, not a global resolution change. It cannot repair the
noise-contour topology or establish improved mountain character by itself.

Production trials of global1km spacing and1km only for the nine-tile close view
exceeded the unchanged128MiB allocation ceiling (134,711,391 and136,036,387
bytes respectively). Neither shipped. Failure logs and the bounded trial patch
remain in `throwaway/sampling-allocation-probes`. Use the existing lab's `cell`
parameter to judge visual value before designing another residency change.

The [camera-matched clay comparison](../assets/slice-04/accepted-field-sampling/visual/README.md)
rejects production refinement:1km smooths close stair steps but leaves the same
regional mountain character at3.5× the lab triangles. Stop resolution work.
The next bounded shape hypothesis is to vary prominence along the existing
dominant crest, producing distinct summits and saddles instead of a uniformly
high wall. Keep source geography, minor folds and sampling unchanged; judge
regional silhouette before adding material or vegetation complexity.
