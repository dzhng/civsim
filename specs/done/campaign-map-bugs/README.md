# Campaign Map Bugs — the vision-audit backlog (shipped)

A batch of campaign-map visual defects surfaced by the `find-map-bugs` vision
audit across three canonical shots (whole-map political, regional-italy
political, a Black-Sea crop): cities rendering offshore, sea names on land,
city names seaward of their markers, jagged faction coastlines, road gaps,
card-anchor defects, a hollow army standard, label collisions, and scenery on
open water. All are fixed. This record is why the fixes took the shape they
did and what must stay true; the code is the source of truth for how.

## The root cause behind half the backlog: three land masks disagreed

Land-truth was computed three incompatible ways, so "is this point land?"
depended on who asked:

1. **mapgen's painted raster** (2 km/px) — the source of `campaign-bg.png`,
   `crates/mapgen/src/raster.rs`, painted in `main.rs`.
2. **the frontend `TerrainField`** — an 8 km downsample of the bg,
   `web/src/campaign/terrain.ts`.
3. **the shader's full-res sea classification** — `seaAmount` in the WGSL, the
   pixels the player actually sees.

City snapping used (1), the sea-label fitter and road cull used (2) at coarse
radii, and the player saw (3). So a city could snap "onto land" by the bake's
raster yet render in the water, and a road approach that was land at 8 km
resolution got culled as sea. The fix unified land-truth ownership first, then
the individual defects fell out.

**One land-truth owner per side of the bake, both defined as "the campaign-bg
pixels":** mapgen classifies its own painted raster (`Raster::classify_rgb` /
`RenderMaskClass`, `crates/mapgen/src/raster.rs` — one rule, exact-color twin
of the frontend `PALETTE`), and `TerrainField.renderLandAt` classifies the
native bg raster at full resolution on the frontend. The 8 km grid was
deliberately **kept**, not retired — it owns height/biome/territory-area
statistics; retiring it would have moved territory. Division of labor:
point-truth → full-res, area statistics → 8 km. The shader-side classifier is
hoisted once into `CAMPAIGN_SEA_PALETTE_WGSL`
(`packages/game-renderer/src/water/waterPalette.ts`) and shared by the map and
territory passes — no caller classifies pixels privately. A node test
(`web/tests/campaignRenderMask.test.ts`) pins bake-vs-frontend agreement on a
probe grid (7,822 points: 7,410 grid + 412 cities) by running the real frontend
classifier against the committed mask probe; a cargo test
(`committed_mask_probe_matches_regenerated_probe`) pins the probe itself against
a re-bake. So the two owners can never silently diverge again.

## What shipped, by defect

- **B1 offshore cities** — the bake snap now targets cells whose 3×3
  neighborhood is all-land in the *final painted* raster (after rivers/lakes
  overpaint), not the pre-paint source. `snapped_city_positions` in
  `crates/mapgen/src/build.rs`; 98 cities moved ≤4.9 km. Ports that would move
  more than 6 km to satisfy the margin are exempt (`CITY_SNAP_EXEMPTIONS`, 8
  named peninsula/strait/small-island harbors) rather than dragged inland. The
  bake invariant `baked_campaign_map_satisfies_mapgen_invariants` pins the
  margin per non-exempt city forever.
- **B2/B8 city names seaward of / overflowing their markers** — see "City
  labels hug their markers" below; this is where the plan diverged most.
- **B3 sea names on land** — the fitter was validating a *vertically mirrored*
  box (it rotated the label in world space while the quad rotates in screen
  space) and then silently drawing rejected placements. Rewritten to fit the
  true drawn box on the render mask and move-before-shrink along the basin's
  long axis; all eight sea names now sit in their water. `fitSeaLabels` +
  `bestPlacement` in `mapPass.ts`.
- **B4 jagged faction coastline** — the territory wash now clips to the
  *drawn* composite waterline (`mix(seaAmount(bg), drawnWaterAmount(biome),
  terrainMix)`), not the 8 km raster, plus a paint-only seaward ring where the
  coarse raster fell short of the coast. Inland faction-vs-faction edges keep
  their crisp nearest-texel character (David approved them) — the inland
  control crop is byte-identical. `territoryPass.ts` + `territory.ts`.
- **B5 Ostia "missing model"** — the model was never missing: the ROMA DOM
  card covered Ostia's anchor, compounded by the node sitting offshore
  pre-snap (fixed by B1). Cards now offset landward in the scene loop.
- **B6 hollow army standard** — the banner cloth was flat faction color drawn
  over the faction's own territory wash (Arverni green on green Gaul), so it
  read as a hollow outline. Fixed with a parchment-lit→ink-deepened luminance
  grade at the marker shader; pinned by a 63-livery model sheet.
- **B7 label/card collisions** — one occupancy authority
  (`arbitrateLabelOccupancy` in `mapPass.ts`) with one exported rect helper
  (`ScreenRect`/`rectsOverlap`) across the canvas/DOM seam. Cards report their
  rects into the arbitration; priority is cards > major faction engravings >
  league names > army labels > city labels.
- **B7b road gaps** — the render cull dropped a whole edge when <50% of its
  samples passed the coarse 8 km land test; it now samples the full-res render
  mask per run, and the bake makes road polylines land-safe. Cosa, Tarracina,
  Ostia, Puteoli reach their settlements; genuine sea crossings still drop.
- **B9 scenery on water** — the campaign scenery builder gates each instance's
  footprint through `TerrainField.renderLandAt`; the ~406 instances that were
  on open water are gone, and the total scenery count barely moves (≈0.3% drop,
  well inside the probe's 10% no-mass-extinction gate).

## City labels hug their markers — the biggest divergence from the plan

The plan (slice 04) made city-label anchors **land-aware**: score candidate
placements by land-fraction through the shared `bestPlacement` scorer and pick
the driest. It worked by the letter — labels landed on land — but achieved it
by letting a coastal city's label *detach* far from its marker to find dry
ground (Corinthus's name floated across the gulf; Tarraco's sat up-coast). That
was the wrong trade. **David's rule: a city label just sits on its city; only
sea/ocean names do land-aware placement.**

So the land-aware city-label path was removed (04b) and the anchor tightened to
sit **directly below the marker** (04c), matching the closeup convention. A
coastal city's name may now read partly over water — that is correct, because it
sits *on its city*. Non-detachment is guaranteed structurally, not by a
threshold: `overviewCityLabelAnchors` authors only the ring-1 hug positions,
and `placeCityLabel` takes the first non-colliding hug position with no water
scoring — so a city label is at most one marker-clearance from its square, or
hidden, never adrift. The shared scorer survives for sea labels only.

A final pass collapsed the remaining redundancy: at overview zoom the city was
drawn as a *square chip* AND its label carried a house glyph, so two icons sat
near each other and read as misaligned. Now **the overview city marker IS the
settlement icon, and it reuses the real glyph** rather than a hand-rolled one:
`campaignCityLabels` renders `ICON_PATHS.city` (faction-tinted, haloed) ABOVE
the name — the label's icon-above layout in `mapPass`'s measure/draw — and the
GPU city chip is gone (`campaignMapMarkers` emits only army markers; the
shader's `markerKind < 0.5` branch is a dead `discard`). One icon per city, name
directly beneath it; at closeup the 3D model is the marker and the label is
text-only. A first attempt drew a procedural house in WGSL and got it both
upside-down and too faint — reusing the atlas glyph is correct orientation,
colour, and halo for free. A **garrisoned** army reads city-first like the
own-city cards: the composed label's primary line is the CITY name, the legion +
strength drop to the secondary line (`campaignArmyLabels`, the `occupiedCity`
branch); a field army keeps the legion as its primary line.

Fixing the marker also exposed that the army standard drew **upside-down** on the
map — `MARKER_WGSL` authored its art y-down while screen y is up, which a
symmetric square chip had hidden for years. The vertex now flips the fragment's
local y (`out.local = vec2f(quad.x, -quad.y)`); the standard's cloth grade is
inverted to compensate so it stays parchment-head / ink-foot (the slice-08
livery gate pins the positive grade).

## Locked invariants (must keep holding)

1. **Map data is bake-owned.** Position/graph fixes go through
   `crates/mapgen` + a re-bake (`cargo run -p mapgen --release`). Never
   hand-edit `web/public/data/campaign-map.json` / `campaign-bg.*`; never add a
   frontend coordinate transform. The bake is deterministic (same source →
   byte-identical output) and self-checks its invariants.
2. **One land classifier per side of the bake**, both = "the campaign-bg
   pixels" (above). No private pixel classification anywhere; the shader-side
   classifier lives once in `CAMPAIGN_SEA_PALETTE_WGSL`.
3. **One projection**: `toScreen`/`screenToWorld` only.
4. **One label system**: the mapPass canvas emitter + DOM cards; an entity
   never renders on both; no second labeler, no per-callsite placement fork.
5. **One placement scorer** (`bestPlacement`) — sea labels only now; a second
   placement implementation is a review-reject.
6. **One occupancy authority** (`arbitrateLabelOccupancy`); cards report rects,
   never arbitrate privately. Consumers checking label overlap must use the
   arbitration's own `inkRect` (deflate-then-rotate AABB), not the full-quad
   box — the two differ for tilted engravings.
7. **One territory material**; wash strength 0.62; the dual faction border
   strips stay; the nearest sampler stays (no blur regression); inland edges
   crisp.
8. **City labels hug their markers; only sea names chase dry ground.**
9. **One bronze token source; battle HUD scenes stay green.** The battle suite
   carries 13 pre-existing failures unrelated to this work (a prior
   crowd/camera commit shipped without re-blessing battle baselines) — the
   firewall is *no new* failures, and none were added.

## The deterministic probe (the cheap per-slice gate)

`tools/render-probe.mjs` boots the campaign, freezes the sim, and measures the
real drawn geometry through the one land-truth owner: per-city marker
land-fraction, drawn sea-label land-fraction, DOM card land-fraction, and
scenery on/over water — deterministic and byte-identical across runs. It is the
cheap regression gate between the expensive vision-audit runs; `tools/README.md`
documents what "green" means per defect. Note the reconciliation recorded
there: the vision audit's "12 offshore cities" split into two classes —
square-marker-on-water (the probe's `landFraction`, B1) and
icon+label-anchored-at-sea (B2, the `b1-tarraco`/`b1-corinthus` crops). City
`landFraction` is now informational, not a gate — a coastal label legitimately
reads partly over water because it hugs its city.

## Dead ends (do not re-walk)

- **Land-aware city-label placement** (the original slice-04 mechanic): scoring
  city labels by dry ground detaches them from their markers. Reverted; city
  labels hug, unconditionally.
- **Retiring the 8 km TerrainField grid** in favor of the full-res mask: it
  owns territory/biome area statistics; retiring it moves territory.
- **Bilinear/linear filtering or an overall upres of the territory raster** to
  smooth the coast: the pre-crisp blur was the *original* complaint; the fix is
  a render-resolution clip, not a filter.
- **Terrain-palette compensation** for the coast wash: out of scope, wrong lever.
- **Duplicating the map projection in `prune-cities.mjs`** to make pruning
  independent of the snap: the bake exports a transient `srcPos` on nodes
  instead, so there is one projection owner.

## Visual provenance

`assets/evidence/` — David's original feedback crops (`david-*.png`) and one
judge-verified crop per defect class (`b1-*` … `b9-*`, plus `*-after-*` pairs):
these crops *are* the acceptance criteria — the defect visible in each is gone
from a fresh capture of the same view. `assets/oracle/` — the vision-audit
close-out reports (per-lane and the final three-shot sweep,
`final-sweep-10/bugs.md`), each with the fresh captures the verdict was read
from. `assets/probe/` — the committed probe baselines. `visualizations/` — the
sea-label fit-vs-drawn overlay built to diagnose B3.

## Open taste rulings left for David (non-defects)

Recorded in `assets/oracle/final-sweep-10/bugs.md`: island-fidelity (real small
islands render as coarse faction-color lozenges at whole-map zoom);
engraved-name placement (major faction names sit at the territory centroid and
can overhang a coastal border); the grey "Independent" southern-Italy fill; and
whether a crowded city label should keep dodging to another side of its own
marker (current) or hold one fixed position and hide on collision.
