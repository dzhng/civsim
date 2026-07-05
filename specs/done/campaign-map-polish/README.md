# Campaign Map Polish (shipped 2026-07-03)

One pass over the whole campaign-map surface, driven by a batch of David's
screenshot feedback: the camera never sees off the map, the terrain reads as a
muted antique chart instead of a vivid webapp map, faction view is EU4-political
(strong color blocks, crisp dual-color borders), the map data is clean (no
cities in the sea, no dead-end roads), labels behave (capitals named at every
zoom, sea names inside their seas), and the campaign DOM is the same worn-bronze
game surface as the battle HUD — with own cities and armies carrying bronze
faction-banner map cards.

Everything below is the *why* and the *invariants*. The *how* lives in the code;
pointers name the entry points.

## Visual provenance — the standards this was held to

The feedback and reference images are the requirement; the result is meaningless
without them. Images in `assets/`, mockups in `visualizations/`:

- `feedback/*.png` — David's annotated screenshots that drove each fix:
  `01` black off-map corners + over-bright palette, `03` the muddy-brown Rome
  faction wash, `04/05` "cities in the sea", `06/15/16` sea labels spilling onto
  land, `07` Rome/Carthage unnamed at zoom-out, `09` the "ugly shadow ring" and
  far garrison label, `10` oversized carts, `11–13` cut-off roads, `14` the
  half-clipped selection ring, `18` blurry territory borders.
- `natural-palette-target.png` — a TW:Troy campaign vista David picked as the
  terrain-palette north star (sun-bleached olive turf, warm desaturated register).
  Drove the grade + grass-hue recolor. Also copied to
  `.agents/skills/aesthetics/references/campaign-natural-target.png`.
- `faction-wash-target-eu4.png` — an EU4 political-mode shot David sent with
  "make the color come through even more"; drove the 0.62 wash strength and the
  dual faction-colored border convention.
- `final-political-whole.png`, `final-cards-regional.png`, `final-border-crop.png`
  — the shipped result, for before/after against the feedback shots.
- `visualizations/city-card-variations.html` — the three candidate designs (A
  slim chip / B plaque with wells / C faction-banner card) for the own-city map
  card, built from the real bronze tokens. David picked **C** and extended it to
  own armies.
- The bronze UI standard is the aesthetics skill's `ui-cardbar-tw.png`; the
  faction-view standard its `campaign-map-political-borders.png`.

## The reason — why it works this way

**Camera clamp uses the real frustum footprint, not a formula.** The old clamp
approximated the tilted view with an orthographic `cos(pitch)` correction; the
perspective trapezoid's top corners overreached the map and showed the void.
`clampCam` now unprojects the four screen corners through the *actual* camera
(`screenToWorld` on `cameraParamsFor`) and bisects for the smallest zoom whose
ground footprint fits `bgRect`. One projection owner; no parallel math to drift.
(`web/src/campaign/renderer.ts` — `clampCam`, `groundFootprintForScale`,
`MAX_CAMPAIGN_ZOOM` is the single zoom-ceiling constant.)

**The palette is graded, not repainted.** The vivid look was the global grade
(over-saturating, brightness-lifting) plus a kelly-green grass constant.
`grade()` in `packages/game-renderer/src/campaign/mapPass.ts` is the one global
tone knob (muted, slightly sepia); `naturalCampaignColor()` owns per-biome hues
(grass pulled to yellow-olive). Judge changes against
`campaign-natural-target.png`, never by taste alone.

**Faction fill: one alpha owner, untinted, nearest-sampled.** The muddy brown
came from (a) mixing the faction color toward warm tan in the shader and (b)
three stacked opacity owners (`FILL_A` texel alpha × pass default × renderer
style) multiplying into an unpredictable net. The fragment now passes the
faction RGB through untinted; `FILL_A` is neutral (255); the renderer-side
`alpha` (0.62, David's EU4 call) is the *only* wash knob for the real map (the
pass default 0.14 exists solely for the controlled tutorial stage). The territory texture
is sampled **nearest** so the wash edge is a crisp texel step, matching the
terrain's own texel look. (`territoryPass.ts`, `web/src/campaign/territory.ts`.)

**Borders are two colored strips, draped on terrain.** Each boundary renders one
strip per neighboring faction meeting at a thin dark seam (the EU4 convention in
`faction-wash-target-eu4.png`). The extraction (`territory.ts`) carries both side
owners per segment; strips are built by `campaignFactionBorderVertices`
(`territoryPass.ts`, width constants at the top) and drawn by the **3D** variant
of `CampaignWorldLinePass` (`mapPass.ts`, `LINE3D_WGSL`) with per-vertex
z = terrain height + lift — a flat z=0 strip is depth-buried under raised land
(that bug shipped first and was fixed by the integrator). The border polyline's
DP tolerance is deliberately tight (`cell*0.55`, 2 Chaikin iterations) so the
smooth strips hug the stepped wash edge instead of cutting corners.

**Map data is fixed in the bake, never in the frontend.** "Cities in the sea"
was *not* corruption: every offender was a coastal port whose center sat one
coarse raster cell offshore (only Cnidus was genuinely adrift). The bake snaps
on-water cities to the nearest land cell and updates incident edge endpoints;
road hygiene prunes junctions only when dangling in the **full multigraph**
(road-degree ≤ 1 AND sea-degree 0) — the first version pruned by road degree
alone and silently severed 241 sea lanes, stranding five ports; an independent
connectivity audit caught it. Invariants are pinned by
`baked_campaign_map_satisfies_mapgen_invariants` (`crates/mapgen/src/main.rs`).
Positions stay verbatim in `web/public/data/campaign-map.json`; there is no
frontend coordinate transform.

**Cut-off roads had two causes at two layers.** The renderer's land-safety cull
(`roadEdgeIsLandSafe`, `mapPass.ts`) dropped whole coastal edges when too many
samples touched the coarse water mask (threshold now 0.5, land slack 16km — a
genuine sea crossing is still mostly water and drops); the rest were real
dead-end stubs left by an earlier city-prune commit, removed in the bake.

**Own entities are DOM cards; everyone else stays canvas.** David picked the
faction-banner card (variation C) and extended it to own field armies. Cards are
React DOM (`web/src/ui/campaign/MapCards.tsx`, styled in
`web/src/campaign/panels.ts`) inside the single campaign HUD root, anchored via
`renderer.toScreen` with **per-frame imperative transforms** — React reconciles
only when the card list changes (the battle HUD's 60Hz-firewall pattern). Own
cities/armies stop emitting canvas labels entirely: the canvas
`CampaignLabel` system owns many-cheap-labels (neutral/enemy), the DOM overlay
owns few-rich-cards — never both for one entity. Card visibility gates mirror
the old canvas gates (tier-by-zoom; armies at zoom > 0.35) so zoom behavior
didn't change. Cards are `pointer-events: none`; map picking is untouched.
An own army on a **foreign** city keeps its army card — only a player-owned
occupied city absorbs the army into the card footer
(`ownGarrisonCityForArmy` in `web/src/campaign/scene.ts`; a review catch —
the first cut made besieging stacks label-less).

**Allegiance is a treatment, not an icon tint.** Icons, markers, and banners are
always faction-colored. Own = bronze card; neutral = engraved canvas label;
enemy = bold red sword right of the label (`ICON_PATHS` + the right-icon draw in
`mapPass.ts`). The aesthetics skill's two-color rule was rewritten to match;
status colors survive only as non-icon accents (selection ring, crowd tint).

**Capitals stay named at every zoom.** Occupied cities used to *suppress* their
city label and ride the garrison army label, which is culled at low zoom —
Rome/Carthage vanished zoomed out. The city label is always emitted now; the
existing collisionGroup overlap cull suppresses the duplicate only while the
composed army label is actually visible.

**Sea labels fit themselves.** No hand-tuned points: at draw-data build the
fitter samples each label's arc against the land mask and shrinks, then nudges
deterministically until the whole curve clears land (the sea-label fit in
`mapPass.ts`, fed by the renderer's `surfaceAt`). The curved-italic style is
untouched; a narrow sea gets a small contained label by design.

**The "ugly shadow ring" was the road-junction plaza.** Two wrong owners were
tried first (the city model shadow — fine on every city; the army standard's
shadow — reverted, it grounds field standards). The real element:
`pushRoadJunctionCaps` (`mapPass.ts`) gave ≥3-degree tier-3 cities a 4.7km plaza
with a 1.42× dark under-disc — a 6.7km halo around capitals. City plazas now
just seat the meeting roads with a hairline rim.

**The selection ring is a grounded decal (reversed 2026-07-05).** This spec
originally set depth-compare `always` so the ring painted over the world,
because "geometry occludes the ring" was the then-reported bug (half-cut
ring). David reversed it after battle-identity: a ring floating above the
city reads worse than a partially occluded one, and today's city/army meshes
only clip a small far-arc segment. The ring draws with a real depth read
(`selectionPass.ts`, `gpuWorldDepthStencil("read")`); the thicker/brighter
geometry from this spec survives. The renderer-lab gates were re-pinned to
the grounded contract (`web/scenes/system/renderer-lab-routes.mjs`).

**One bronze, one root.** The campaign DOM consumes the battle `bronze.css`
tokens verbatim (no brass variant, no forked tokens) and mounts through a single
React root — `mountCampaignHud` (`web/src/ui/campaign/CampaignHud.tsx`),
mirroring `mountBattleHud` — used by both the game (`scene.ts`) and the
renderer-lab (`uiLayer.ts`), so the two surfaces cannot drift. Panel
**material/shape** is shared CSS; **placement** is game-scoped under
`#campaign-ui` while the lab fixture positions the same panels inside its own
box (`apps/renderer-lab/src/router.ts`) — note the `:is(#id, .class)` selector
inflates specificity to id-level for *both* branches, which is what originally
let game placement override the lab and eat its canvas clicks.

**Carts are decoration-sized.** One emit-time constant (`campaignRoadCarts` in
`web/src/campaign/renderer.ts`): size ≈ the road's full width, not unit scale.

## Invariants — what must stay true

1. **One projection owner.** Camera math (clamp, picking, cards, labels) goes
   through `cameraParamsFor`/`screenToWorld`/`toScreen`. No parallel estimates.
2. **One tone owner.** Global tone = `grade()`; biome hues =
   `naturalCampaignColor()`. Never re-tint terrain elsewhere to fix a wash.
3. **One wash knob.** Faction-fill opacity is the renderer-side `alpha` only;
   `FILL_A` stays 255, the fragment stays untinted.
4. **Map data is bake-owned.** Never hand-edit `campaign-map.json`; never add a
   frontend coordinate transform. The mapgen invariant test must stay green —
   it pins on-land cities, stub-free roads, and full port sea-connectivity.
5. **Label ownership is split, never doubled.** Own entities = DOM cards;
   neutral/enemy = canvas labels. An entity never renders both. Card zoom gates
   mirror the canvas tier/zoom gates.
6. **Icons never carry allegiance color** (the two-color rule in the aesthetics
   skill).
7. **Bronze tokens have one source** (`web/src/ui/theme/bronze.css`); battle HUD
   scenes are a hard firewall for any change to it.
8. **The zoom ceiling is `MAX_CAMPAIGN_ZOOM`** — one exported constant.
9. **Verification scenes assert where the surface lives**: own-city coverage via
   DOM-card queries, neutral/enemy via canvas label stats.

## Verification map

Browser gates (run `cd web && VERIFY_URL=<own vite> VERIFY_GPU=1 node scene.mjs …`;
start a dedicated dev server — port 5173 usually belongs to another worktree,
and vite can serve a stale module for one run after a shader edit):
`campaign-frame` (no off-map corners at wide/tall aspects), `campaign-lod`
(palette, faction view, labels, cards, ring, roads-on-land),
`campaign-polish-roads` / `campaign-polish-markers` (continuity + label/card
split), `campaign-production` / `campaign-conquest` / `campaign-save-load`
(behavior), `renderer-lab-routes` (lab fixture + re-pinned selection gates).
Cargo: `cargo test -p mapgen -p campaign`. Baselines in `web/shots/campaign/`.

## Dead ends — do not re-walk

- **Bilinear + higher-res territory texture** for crisp borders: unnecessary —
  nearest sampling alone matches the map's texel aesthetic.
- **Fixing the wash by re-tinting terrain** in mapPass: forks the palette owner.
- **Flat z=0 border strips**: depth-buried under raised terrain; strips must
  carry terrain height (the 3D line variant exists for exactly this).
- **Pruning junctions by road degree alone**: severs sea lanes; the multigraph
  degree is the correct dangling test.
- **Treating any on-city own army as garrisoned**: strips a besieging army of
  every label; garrison = player-owned city only.
- **Hunting the "shadow ring" in shadows**: it was road-junction plaza geometry.
- **Card variation B (plaque with wells)**: chosen on critique evidence, then
  overridden by David for C (faction-banner) extended to armies — ownership
  color on the card beats material richness here.
- **Compat role-classes as a second style system**: the lab keeps layout-only
  rules; material has one owner. Watch the `:is(#id, .class)` specificity trap.

## Known follow-ups (out of scope)

- Some faction *palette* entries are hard to distinguish at zoom-out (e.g. the
  Macedon blue vs Seleucid teal and the pastel league colors) — that's the `map.factions[].color` data table.
- The bronze top bar wraps to two rows under ~1100px width (functional, could
  be tightened).
- A full source re-bake of the map JSON needs the gitignored ORBIS/Natural-Earth
  source data (`crates/mapgen/data/fetch.sh`); the shipped JSON was regenerated from the saved baked
  artifact through the same Rust rules.
