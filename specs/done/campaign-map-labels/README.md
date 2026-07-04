# Campaign Map Labels — naming, density, marker truth (shipped)

Three linked problems on the campaign map, all about *which name renders where*:

1. **Naming.** City/faction names carried ORBIS parentheticals ("Apamea
   (Pisidia)", two "Caesarea"s). They now drop the qualifier where the base is
   unique and keep it de-parenthesized ("Caesarea Cappadocia") only to
   disambiguate.
2. **Density.** The zoomed-out political map was a wall of ~28 faint minor-league
   names. Names now compete on one importance budget: the strong realms and
   cities keep their name, minor leagues yield, and culled leagues reappear as
   the camera comes in. **Leagues are just factions** — same code path, same
   style; they rank lower only because they hold less.
3. **Marker truth.** A city marker rendered offshore though its anchor was on
   land, and the probe never caught it. The marker now hugs its city and the
   probe verifies the *drawn* pixel.

Built directly on the shipped `specs/done/campaign-map-bugs/` work: the one
land-truth owner, the one occupancy authority (`arbitrateLabelOccupancy`), the
one label emitter, and the deterministic `render-probe.mjs`. Every change grew an
existing owner; none forked one.

## What shipped, and the reason it took this shape

**Offshore marker — a render bug, not bad data (the diagnosis that mattered).**
Three independent design drafts proposed three different causes. Instead of
voting, the anchor was measured live: it projects onto land ~60 km inland, but
the *drawn* icon sat 52 px **west, on sea**. That 52 px is `horizontalEdgeOffset`
— the world-edge inset authored for free-floating faction engravings, which
campaign-map-bugs slice-04 had inadvertently applied to the icon-above city
*marker*. Removing the inset from the city-label path (it stays on faction
engravings) puts every city marker back on its anchor. The competing hypothesis
(the bg-raster classifier disagreeing with the biome drawn-coast) is real in
general but was ruled out here — the anchor is far past the 8 km biome smoothing.
The fix also un-shoved Corduba and Londinium, not just Ierusalem.

**Faction power is owned-city tier-sum, not territory area — the calibration
that decided the feature.** The first importance cut used the faction label's
`radiusKm`, but that value is capped at 1.5× Rome for the territory wash, so the
six majors and the big leagues all tied and **Rome — territorially small at game
start — ranked last**. Switching to uncapped area was worse: it favours vast,
near-empty steppe leagues (TANAIS controls one city across a huge range). The
signal that ranks correctly is the **sum of the tiers of the cities a faction
holds** (live, from `opts.cities`): majors land at 21–30 (Rome #3), substantial
leagues rank fairly, and a one-city league drops to the bottom. It is also stable
— it moves only on conquest, not with every army step.

**Decluttering is by VISIBILITY, not opacity — faction and city names are
solid.** David's rule: only sea names carry opacity; a faction or city name
renders at full strength or not at all. So the density lives in `visibleLabels`
as a hard visibility gate, not a fade — a first cut used an opacity *ramp* and it
produced faint half-visible league "ghosts", which was the wrong shape. Now a
league keeps its solid name once its owned-city power clears a zoom-scaled bar
(`LEAGUE_IMPORTANCE_BAR_HI`, high at overview so only strong leagues show,
falling as the camera comes in — the reappearance mechanism, stateless), and is
simply hidden below it; faction engravings retire past `FACTION_RETIRE_ZOOM`
where city labels carry the detail. Because shown leagues are now solid (above
`OCCUPANCY_MIN_OPACITY`), they also arbitrate: the `arbitrateLabelOccupancy`
reorder (importance-descending, one budget, `stageOf` removed) resolves their
collisions. Overview faction labels dropped from ~34 to a clean solid set of
6 majors + ~6 strong leagues; an unbiased critique read it as "not a wall of
text."

## Principles & invariants (must keep holding)

1. **Density is one authority, one budget.** All ranking/culling lives in
   `arbitrateLabelOccupancy` (collision) + `visibleLabels` (LOD). No parallel
   culler, no per-kind stage ladder, no second budget.
2. **Naming is bake-owned, computed once.** The drop-qualifier rule is a single
   final mapgen post-step (`crates/mapgen/dequalify-names.mjs`) after leagues +
   prune (so it sees the final population); the frontend renders
   `node.name`/`faction.name` verbatim; `campaign-map.json` is machine-written.
3. **Marker verification is the render-probe, extended.** The drawn-icon rect and
   its detached-marker gate live on `CampaignLabelDebugRect` + `render-probe.mjs`;
   no second verifier.
4. **Leagues == factions.** One faction code path, one importance formula, one
   style. A league ranks lower only because its owned-city tier-sum is lower.
5. **Importance is assembled at the emitters, never baked.** One baked field
   (city `tier`) + runtime state (owned-city tier-sum, soldier mass).
6. **City labels hug their markers; only sea names chase dry ground** (carried
   from campaign-map-bugs — this feature closed the last violation).
7. **Offset, not land-fraction, gates a detached marker.** A coastal port's
   marker legitimately overhangs the waterline (informational); a marker
   *displaced* from its city is the bug. The probe gates on `drawnIconOffsetPx`.
8. **Only sea names carry opacity.** Faction and city names render solid or not
   at all — density is a visibility gate (`LEAGUE_IMPORTANCE_BAR_HI` /
   `FACTION_RETIRE_ZOOM`), never a fade. A half-visible faction/city label is a
   bug.

## Pointers into the code

- **Offshore fix** — `web/src/campaign/renderer.ts`: `campaignCityLabels`,
  `overviewCityLabelAnchors`, `closeupCityLabelAnchors` (no world-edge inset);
  the inset stays in `campaignFactionLabels`.
- **Importance** — `web/src/campaign/renderer.ts`: `cityImportance` /
  `factionImportance` / `armyImportance` and the owned-city tier-sum in
  `campaignFactionLabels`; `CampaignLabel.importance` in
  `packages/game-renderer/src/campaign/mapPass.ts`.
- **Density** — `packages/game-renderer/src/campaign/mapPass.ts`:
  `arbitrateLabelOccupancy` (importance comparator) and `visibleLabels`
  (`LEAGUE_IMPORTANCE_BAR_HI` league LOD).
- **Naming** — `crates/mapgen/dequalify-names.mjs`, wired in
  `crates/mapgen/src/main.rs` after prune; invariant in the cargo test
  `baked_campaign_map_satisfies_mapgen_invariants` (no parens, unique city
  names). `landroute::SEA_ONLY_CITIES` tracks the post-rename name.
- **Probes** — `specs/done/campaign-map-bugs/tools/render-probe.mjs`
  (`iconRect`, `drawnIconLandFraction`, `drawnIconOffsetPx`,
  `maxDrawnIconOffsetPx`); `tools/reappearance-probe.mjs` (monotonic league
  reappearance + overview budget).

## Dead ends (do not re-walk)

- **Capped `radiusKm` for importance** — the wash cap ties every big realm and
  sinks Rome. Use owned-city tier-sum.
- **Uncapped territory area for importance** — over-weights sparse steppe
  leagues (one city, vast range). Same lesson: area ≠ power.
- **Army strength as the primary faction-power term** — explored, then dropped:
  tier-sum already separates majors from neutral leagues and is stable across
  army movement (army stays as the *army-label* importance only).
- **Reordering `arbitrateLabelOccupancy` alone to declutter** — leagues are below
  the arbitration opacity threshold at overview; the declutter is a
  `visibleLabels` LOD change.
- **Crowding margin (planned slice 05)** — resliced to a no-build: slice 04's
  declutter left the overview *sparse*, not crowded, so a spacing pad would only
  sparsify further.
- **`renderDrawnLandAt` / biome drawn-coast owner** — deferred, not built: no
  current marker sits in the bg-vs-biome divergence band. The signal to build it
  is a marker that passes the drawn-rect check yet still reads as sea.

## Divergences from the plan

- Slice 04 absorbed the slice-03 formula fix (tier-sum) **and** the
  `visibleLabels` LOD change the plan had split toward slice 06 — the visible
  declutter needs both, so they landed together.
- Slice 05 (crowding) shipped as a documented no-build (premise removed by 04).
- Slice 06 became pure verification (`reappearance-probe.mjs`); the mechanism is
  slice 04's LOD bar.

## Open taste rulings left for David (non-defects)

From the unbiased screenshot-critique of the decluttered overview:
- **Duplicate name**: a league engraving and its lead-city label render the same
  string near each other (IERUSALEM league + IERUSALEM city). Pre-existing, more
  visible now that strong leagues show. Candidate fix: suppress the league
  engraving when its lead-city label is present.
- Faint league engravings can read sea-like (they *are* faction-styled per the
  "leagues == factions" rule; faintness is the cause).
- The overview is arguably a touch sparse — `LEAGUE_IMPORTANCE_BAR_HI` (14)
  could drop a point or two to admit a few more leagues.

## Visual provenance

- `assets/evidence/overview-decluttered.png` — the shipped whole-map political
  overview (6 majors + ~7 strong leagues + cities), the "not a wall of text"
  result the density work was aiming at.
- `assets/evidence/ierusalem-marker-fixed.png` — Ierusalem's house on its land
  (was adrift in the sea to the west).
- `assets/drafts/README.md` — the three independent slice drafts' agreements and
  splits; the offshore root cause resolved by measurement, not vote.
