# Campaign Map Labels — naming, density, and marker truth

Three linked problems on the campaign map, all about *which name renders where*:

1. **Naming.** City/faction names carry ORBIS parentheticals ("Apamea
   (Pisidia)", two "Caesarea"s). Drop the qualifier where the base name is
   unique; keep it (no parens: "Caesarea Cappadocia") only to disambiguate.
2. **Density.** Zoomed out is a wall of text. Cities *and* faction/league
   names should compete for one importance-ranked budget so only the names
   that fit — powerful realms, high-tier cities — survive at overview, and the
   rest reappear as you zoom in. **Leagues are just factions**: same code path,
   same style, no special-case text — they simply score lower when their
   territory is small.
3. **Marker truth.** A city marker rendered offshore though its anchor
   classified as land, and the probe never caught it because it sampled the
   anchor's land classification, not the drawn marker. Fix the placement and
   harden the probe to verify the *drawn* pixel.

This builds directly on the shipped `specs/done/campaign-map-bugs/` work: the
one land-truth owner (`renderLandAt` / `CAMPAIGN_SEA_PALETTE_WGSL`), the one
occupancy authority (`arbitrateLabelOccupancy`), the one label emitter, and the
deterministic `render-probe.mjs`. Nothing here forks those; every slice *grows*
the existing owner.

---

## Next Agent Prompt

**Status (2026-07-04):** Slice 00 (offshore marker) is SHIPPED and verified in
this worktree — not yet committed alongside the rest. Spec just materialized.
Pick up at **Slice 01 (probe hardening)**.

**Do this next, in order:**

1. **Slice 01 — harden the probe** (`slices/01-probe-drawn-marker.md`). Extend
   `render-probe.mjs measureCities` to classify the *drawn* icon rect, not the
   anchor. This is the regression lock for the bug Slice 00 fixed; write it so
   that reverting Slice 00 turns it RED.
2. **Slice 02 — naming rename** (`slices/02-name-dequalify.md`). A final mapgen
   post-step (after prune + leagues), cargo invariant, re-bake.
3. **Slices 03–06 — density** (`slices/03..06`). Importance scalar → unified
   greedy rank → crowding margin → reappearance verify. Each grows
   `arbitrateLabelOccupancy`; re-bless overview snaps on the visual ones.

Slices 01 and 02 are independent of each other and of 03–06's start; 03–06 are
serial. Run the per-slice gates below. **Update this section before ending your
pass.**

### Global TODO
- [x] **00** Offshore marker fix — remove world-edge inset from city labels *(shipped, uncommitted)*
- [ ] **01** Probe samples the drawn icon rect *(owns: render-probe.mjs + `CampaignLabelDebugRect.iconRect`)*
- [ ] **02** Drop-qualifier-when-unique naming *(owns: mapgen post-step + cargo invariant)*
- [ ] **03** Importance scalar on every arbitrating label *(owns: emitters + `CampaignLabel.importance`)*
- [ ] **04** Unified importance-ranked greedy over one budget *(owns: `arbitrateLabelOccupancy`)*
- [ ] **05** Crowding margin *(owns: the overlap test inside the arbitration)*
- [ ] **06** Reappearance-at-zoom verify + per-zoom budget *(owns: `visibleLabels` + zoom-ladder probe)*

---

## The offshore root cause (resolved by instrumentation, not hypothesis)

Three independent design drafts proposed three different causes: (A/C) a label
shove dragging the icon off its anchor; (B) the bg-raster land classifier
disagreeing with the biome-derived *drawn* coastline at the anchor. Rather than
pick, we measured Ierusalem live (`freeze` + `project` + the drawn
`visibleCityLabelRects` box + the rendered pixel):

- Anchor `[1619.27, -545.94]` projects to screen `(1417, 782)`, is bg-**land**,
  and is ~60 km inland — comfortably beyond the 8 km biome smoothing, so it
  renders as land. **Draft B's biome divergence is real in general but is NOT
  what put Ierusalem offshore.**
- The *drawn* icon box centre sat at `(1365, 782)` — **52 px west** of the
  anchor — on bg-**sea**. That −52 px is `horizontalEdgeOffset`: the world-edge
  inset (`renderer.ts`), which keys on the city's normalized position *within
  the map bounds* and shoves any label in the outer 22 % of the world inward,
  at every zoom. **Draft A/C is correct.**

Since slice-04 of campaign-map-bugs made the overview city marker *be* the
label's icon, that inset — authored for free-floating faction engravings —
dragged the **marker** off its city into the water. The fix (Slice 00) removes
the world-edge inset from the city-label path entirely; the icon now sits on
its anchor (`bg-land`, offset ≈ 0). This is the same "labels must hug their
markers" invariant the shipped spec already established — the inset was a
surviving violation of it.

**Latent risk recorded, not built:** the bg-raster vs biome drawn-coast
divergence (Draft B) is genuine — near a coast, within ~8–16 km, `renderLandAt`
(bg) and the drawn waterline (`drawnWaterAmount(biomeAlpha)`,
`waterPalette.ts`) can disagree. No current city sits in that band offshore,
so we do not add a `renderDrawnLandAt` owner now. If a future offshore marker
survives Slice 01's drawn-rect check yet still reads as sea, that is the signal
to promote the drawn-coast into a second land-truth face consulted by both the
probe and the bake snap. Slice 01 samples the drawn *rect*; it does not yet
switch the *classifier*.

---

## Single-owner invariants (firewalls — every slice inherits these)

1. **Density GROWS `arbitrateLabelOccupancy`.** One importance-ranked greedy
   pass over one shared claim set for cities + factions + armies. No parallel
   culler, no second budget, no per-kind stage ladder once Slice 04 lands.
2. **Naming is bake-owned, computed once.** The drop-qualifier rule lives in a
   single final mapgen post-step (after prune changes the surviving
   population and after leagues derive their names from cities); the frontend
   renders `node.name` / `faction.name` verbatim; `campaign-map.json` is only
   ever machine-written.
3. **Marker verification EXTENDS the render-probe.** The drawn-rect check grows
   `render-probe.mjs` + one new field on `CampaignLabelDebugRect`. No second
   verifier tool, no parallel telemetry.
4. **Leagues == factions.** One faction code path, one importance formula, one
   style scale. No league-specific text, colour, or ranking branch anywhere
   (only the pre-existing `factionMinor` size term).
5. **Importance is assembled at the emitters, never baked.** One baked field
   (city `tier`) blended with two runtime fields (faction territory size,
   army strength) + the zoom term — computed per frame where the label is
   built. Baking faction power would freeze conquest.
6. **City labels hug their markers; only sea names chase dry ground.** (Carried
   from campaign-map-bugs — Slice 00 closed the last violation.)

## Firewalls (must stay green every slice)
- Battle HUD / battle scenes untouched — all work is in `campaign/` + `mapgen`.
- `web/tests/campaignRenderMask.test.ts` (the land-truth bridge) green — no
  slice alters `renderLandAt` / `classify_rgb` / `CAMPAIGN_SEA_PALETTE_WGSL`.
- The collision test (arbitration's own `inkRect`) green through 04/05.
- Cards keep priority over labels (pre-claimed `blockedRects`).

## Verify recipes
- Per-worktree vite on its dedicated port (`:5199` here) + `VERIFY_URL`;
  `VERIFY_GPU=1 node scene.mjs <scene>` for `campaign-visual` / `campaign-lod`
  / `campaign-collision` / `campaign-polish-markers`; `UPDATE_SHOTS=1` to bless.
- `render-probe.mjs` is the cheap per-slice gate; `find-map-bugs` is the
  expensive vision oracle at each lane close-out.
- `cargo test -p mapgen -p campaign` (rustfmt via the rustup toolchain PATH);
  re-bake `cargo run -p mapgen --release`.
- **Every visual slice** runs [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md)
  as its last check, and [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md)
  whenever there is a prior look to judge against.

## Reference
- `specs/done/campaign-map-bugs/` — the shipped land-truth / label-hug / probe
  work this feature extends. Read its README first.
- Draft plans that fed this synthesis are archived in
  `assets/drafts/` (three independent cuts; where they agreed = firm ground,
  where they split = the offshore root cause resolved above).
