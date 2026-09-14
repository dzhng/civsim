# Regional spike evidence

## Outcome

The regional campaign prototype renders real geography through battle's terrain material, physical environment, water response, and shared scenery registry. It replaces independent mountain props with connected relief inside the preview only. The production campaign is not migrated, and the reference quality bar is not yet met.

[Current Italy](assets/spikes/current-italy.png) and [current Alps](assets/spikes/current-alps.png) are the frozen candidate evidence. The [reference](assets/landscape-reference.png) remains the acceptance target. Different geography/framing makes full-frame pixel similarity to that reference meaningless; the comparison concerns landform, material, foliage, shoreline, lighting, and scale.

## Verification

- Full web suite: 74 files, 425 tests passed.
- Type checking and the production web build passed.
- Targeted lint and whitespace checks passed.
- `campaign-landscape`: both real regions rendered without GPU validation warnings or page errors; both snapshots repeated with zero pixel differences on SwiftShader.
- `tree-canopies`: shared model sheet repeated with zero pixel differences.
- `terrain-water`: terrain and standalone water sampled RGB `[76,134,151]` under identical light; channel delta zero. Snapshot repeated with zero pixel differences.
- Mutation proof: restoring the former double conversion made terrain water `[18,63,85]` against standalone `[76,134,151]`, a maximum channel delta of 71; the consumer check and screenshot failed. The corrected code was restored and the gate passed again.
- Independent `codex review --uncommitted`: no actionable correctness defects. The reviewer ran type checking and the two new unit tests; browser gates were run by the implementing agent.

Submitted geometry in the same frozen Alpine scene fell from 11,853,073 to 2,541,433 triangles when the leaf models were replaced by smooth coarse crowns (same 1,651 tree instances). Italy fell from 6,073,585 to 1,510,825 (same 809 tree instances). These counts include render/shadow work and demonstrate lower geometry cost, not measured hardware frame rate.

## Visual verdict

An unprimed reviewer confirmed connected ridges, grass on gentler shelves, consistent directional shadows, and readable tree clusters. The reviewer rejected final visual acceptance, with high-confidence gaps:

- Rock faces retain contour-like markings and overly smooth shapes; Alpine crests expose sampled steps.
- Tree crowns repeat and need richer forest edges and variation; isolated trees on shelves can confuse scale.
- The model sheet exposes abrupt dark crown lobes and simple conifers. Coarse crowns suit distant views, not close inspection.
- Sea remains too uniform, shore bands too soft, with insufficient depth variation, surf, and river integration.
- The palette and lighting remain less vivid and less materially distinct than the reference.
- Plains need intermediate vegetation and stone detail between bare grass and tree crowns.

These are outstanding implementation work, not optional polish dismissed by a green screenshot gate. The candidate is retained as a working architecture/landform spike.

## Behavior ledger

No existing test assertions or committed baselines were re-pinned. New gates cover:

| Test | Previous coverage | New coverage | Why |
|---|---|---|---|
| Campaign surface triangle seating | None for this prototype | Queries match actual triangle-centroid elevations, including coast slopes | Preserve the common surface for later roads, props, and picking |
| Campaign detailed coast | None for this prototype | Detailed coast controls land/water even if the coarse biome disagrees; trees sit on its surface | Avoid repeating coarse-mask shore drift |
| Campaign landscape snapshots | None | Two real regions with continuous relief and shared physical rendering | Make each visual iteration reviewable and reproducible |
| Tree canopy sheet | None | Shared coarse tree-family silhouettes | Review the strategic-scale representation separately from detailed leaves |
| Terrain water consumer comparison | No check for this mismatch | Equivalent water consumers agree within two color levels; mutation formerly differed by 71 | Catch double color conversion in the actual rendered output |

The shared terrain-water fix changes battle on-field water as well as the prototype. Existing detailed tree models, battle generation, movement, and production campaign selection/overlays were not altered by this spike.
